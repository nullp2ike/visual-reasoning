import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { visualAI } from "../../../src/index.js";
import type { VisualAIClient } from "../../../src/index.js";
import {
  VisualAIAuthError,
  VisualAIConfigError,
  VisualAIProviderError,
  VisualAIRateLimitError,
} from "../../../src/errors.js";
import { calculateCost } from "../../../src/core/pricing.js";
import {
  ImageDetail,
  type ImageDetailLevel,
  ReasoningEffort,
  type ReasoningEffortLevel,
} from "../../../src/constants.js";
import type { ProviderName } from "../../../src/types.js";
import {
  atomicWriteJson,
  inferProvider,
  readJsonIfExists,
  retryWithBackoff,
  runPool,
} from "../../src/util.js";
import { visibilityBenchConfig } from "../visibility.config.js";
import { loadVisibilityGroundTruth, resolveVisibilityDataset } from "./ground-truth.js";
import { isRecordCurrent, recordPath, runsDir } from "./records.js";
import {
  VisibilityRunRecordSchema,
  type CallMode,
  type VisibilityCall,
  type VisibilityImage,
  type VisibilityRunRecord,
} from "./types.js";
import type { UsageInfo } from "../../../src/types.js";

const REASONING_EFFORTS = Object.values(ReasoningEffort);

function isReasoningEffort(value: string): value is ReasoningEffortLevel {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

const IMAGE_FIDELITIES = Object.values(ImageDetail);

function isImageFidelity(value: string): value is ImageDetailLevel {
  return (IMAGE_FIDELITIES as readonly string[]).includes(value);
}

interface RunCell {
  model: string;
  provider: ProviderName;
  filename: string;
  rep: number;
}

/** A cell is complete when its record exists, parses, succeeded, and is not stale. */
async function isCellComplete(
  dataset: Parameters<typeof recordPath>[0],
  cell: RunCell,
  image: VisibilityImage,
  effort: string,
  fidelity: string,
): Promise<boolean> {
  const raw = await readJsonIfExists(recordPath(dataset, cell, effort, fidelity));
  if (raw === undefined) return false;
  const parsed = VisibilityRunRecordSchema.safeParse(raw);
  return parsed.success && parsed.data.status === "ok" && isRecordCurrent(parsed.data, image);
}

function isTransient(error: unknown): boolean {
  if (error instanceof VisualAIAuthError || error instanceof VisualAIConfigError) return false;
  if (error instanceof VisualAIRateLimitError) return true;
  if (error instanceof VisualAIProviderError) return true;
  // Generic network failures (fetch/undici/socket errors) are worth retrying.
  return error instanceof Error && !(error instanceof TypeError);
}

const API_KEY_ENV: Record<ProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

// Rough per-call token guess for the pre-sweep cost estimate only. A visibility
// answer is one short verdict per element, so output runs lighter than the
// screenshot bench's open-ended bug list.
const ESTIMATE_INPUT_TOKENS = 2000;
const ESTIMATE_OUTPUT_TOKENS = 600;

/** The calls one rep makes: one per non-empty section, so never an empty list. */
export function callsForImage(image: VisibilityImage): { mode: CallMode; elements: string[] }[] {
  const calls: { mode: CallMode; elements: string[] }[] = [];
  if (image.visibleCall.length > 0) calls.push({ mode: "visible", elements: image.visibleCall });
  if (image.hiddenCall.length > 0) calls.push({ mode: "hidden", elements: image.hiddenCall });
  return calls;
}

function estimateSweepCost(
  cells: readonly RunCell[],
  callsPerCell: (cell: RunCell) => number,
): number | undefined {
  let total = 0;
  let priced = 0;
  for (const cell of cells) {
    const cost = calculateCost(
      cell.provider,
      cell.model,
      ESTIMATE_INPUT_TOKENS,
      ESTIMATE_OUTPUT_TOKENS,
    );
    if (cost !== undefined) {
      total += cost * callsPerCell(cell);
      priced++;
    }
  }
  return priced > 0 ? total * (cells.length / priced) : undefined;
}

/** Sum usage across a rep's calls so cost, tokens and latency stay per-rep. */
export function sumUsage(calls: readonly VisibilityCall[]): UsageInfo | undefined {
  const present = calls.map((c) => c.usage).filter((u): u is UsageInfo => u !== undefined);
  if (present.length === 0) return undefined;
  const add = (pick: (u: UsageInfo) => number | undefined): number | undefined => {
    const values = present.map(pick).filter((v): v is number => v !== undefined);
    return values.length === 0 ? undefined : values.reduce((sum, v) => sum + v, 0);
  };
  return {
    inputTokens: add((u) => u.inputTokens) ?? 0,
    outputTokens: add((u) => u.outputTokens) ?? 0,
    reasoningTokens: add((u) => u.reasoningTokens),
    cachedInputTokens: add((u) => u.cachedInputTokens),
    estimatedCost: add((u) => u.estimatedCost),
    reportedCost: add((u) => u.reportedCost),
    // Calls run one after another, so the rep's wall time is their sum.
    durationSeconds: add((u) => u.durationSeconds),
  };
}

async function executeCell(
  cell: RunCell,
  client: VisualAIClient,
  imageBytes: Buffer,
  image: VisibilityImage,
  effort: string,
  fidelity: string,
): Promise<VisibilityRunRecord> {
  const base = {
    schemaVersion: 2 as const,
    model: cell.model,
    provider: cell.provider,
    filename: cell.filename,
    imageSha256: image.sha256,
    rep: cell.rep,
    promptHash: image.promptHash,
    reasoningEffort: effort,
    imageFidelity: fidelity,
    maxTokens: visibilityBenchConfig.maxTokens,
    timestamp: new Date().toISOString(),
  };

  const calls: VisibilityCall[] = [];
  for (const spec of callsForImage(image)) {
    try {
      const result = await retryWithBackoff(
        () =>
          spec.mode === "visible"
            ? client.elementsVisible(imageBytes, [...spec.elements])
            : client.elementsHidden(imageBytes, [...spec.elements]),
        {
          maxAttempts: visibilityBenchConfig.maxAttempts,
          isRetryable: isTransient,
          onRetry: (error, attempt, delayMs) => {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(
              `  retry ${attempt}/${visibilityBenchConfig.maxAttempts - 1} for ${cell.model}/${cell.filename}/rep_${cell.rep} (${spec.mode}) in ${Math.round(delayMs / 1000)}s: ${message}`,
            );
          },
        },
      );
      calls.push({
        mode: spec.mode,
        elements: spec.elements,
        status: "ok",
        result: {
          pass: result.pass,
          reasoning: result.reasoning,
          statements: result.statements,
        },
        usage: result.usage,
      });
    } catch (error) {
      if (error instanceof VisualAIAuthError || error instanceof VisualAIConfigError) throw error;
      const err = error instanceof Error ? error : new Error(String(error));
      calls.push({
        mode: spec.mode,
        elements: spec.elements,
        status: "error",
        error: {
          name: err.name,
          message: err.message,
          attempts: visibilityBenchConfig.maxAttempts,
        },
      });
    }
  }

  // A rep is graded as a whole, so one failed call fails the rep. The other
  // call's answers are still stored for inspection.
  const failed = calls.find((c) => c.status === "error");
  return {
    ...base,
    status: failed ? "error" : "ok",
    calls,
    usage: sumUsage(calls),
    error: failed?.error,
  };
}

async function confirmSweep(
  cellCount: number,
  callCount: number,
  estimate: number | undefined,
): Promise<boolean> {
  const estimateText = estimate === undefined ? "unknown" : `~$${estimate.toFixed(2)}`;
  console.log(
    `About to execute ${cellCount} reps / ${callCount} model calls (estimated cost ${estimateText}).`,
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("Proceed? [y/N] ");
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      dataset: { type: "string" },
      models: { type: "string" },
      images: { type: "string" },
      reps: { type: "string" },
      force: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      concurrency: { type: "string" },
      effort: { type: "string" },
      fidelity: { type: "string" },
    },
  });

  const dataset = resolveVisibilityDataset(values.dataset);
  console.log(`Dataset: ${dataset.id} (${dataset.dir})`);

  const effort = values.effort ?? visibilityBenchConfig.reasoningEffort;
  if (!isReasoningEffort(effort)) {
    throw new Error(
      `Invalid --effort "${effort}". Valid efforts: ${REASONING_EFFORTS.join(", ")}.`,
    );
  }
  const fidelity = values.fidelity ?? visibilityBenchConfig.imageFidelity;
  if (!isImageFidelity(fidelity)) {
    throw new Error(
      `Invalid --fidelity "${fidelity}". Valid fidelities: ${IMAGE_FIDELITIES.join(", ")}.`,
    );
  }
  const concurrencyPerProvider = values.concurrency
    ? Number(values.concurrency)
    : visibilityBenchConfig.concurrencyPerProvider;
  if (!Number.isInteger(concurrencyPerProvider) || concurrencyPerProvider < 1) {
    throw new Error(`Invalid --concurrency "${values.concurrency ?? ""}" (positive integer)`);
  }
  const reps = values.reps ? Number(values.reps) : visibilityBenchConfig.repeats;
  if (!Number.isInteger(reps) || reps < 1) {
    throw new Error(`Invalid --reps "${values.reps ?? ""}" (positive integer)`);
  }

  const allImages = await loadVisibilityGroundTruth(dataset.dir);
  const imageFilter = values.images
    ?.split(",")
    .map((i) => i.trim())
    .filter(Boolean);
  if (imageFilter) {
    const known = new Set(allImages.map((i) => i.filename));
    const unknown = imageFilter.filter((f) => !known.has(f));
    if (unknown.length > 0) {
      throw new Error(
        `--images names file(s) not in the ground truth: ${unknown.join(", ")}. ` +
          `Available: ${[...known].join(", ")}.`,
      );
    }
  }
  const images = allImages.filter((i) => !imageFilter || imageFilter.includes(i.filename));

  // `--models` selects models outright rather than filtering the roster, matching
  // bench:run: the roster is the default set, not an allowlist.
  const modelFilter = values.models
    ?.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const models = modelFilter ?? [...visibilityBenchConfig.models];
  if (models.length === 0 || images.length === 0) {
    throw new Error("No models selected, or the image filter matched nothing");
  }

  console.log(
    `${images.length} image(s), ${images.reduce((sum, i) => sum + i.elements.length, 0)} element(s) under test ` +
      `(${images.reduce((sum, i) => sum + i.visibleCall.length, 0)} asked via elementsVisible, ` +
      `${images.reduce((sum, i) => sum + i.hiddenCall.length, 0)} via elementsHidden).`,
  );
  console.log(`Reasoning effort: ${effort}`);
  console.log(`Image fidelity: ${fidelity}`);

  const byFilename = new Map(images.map((i) => [i.filename, i]));
  const allCells: RunCell[] = models.flatMap((model) =>
    images.flatMap((image) =>
      Array.from({ length: reps }, (_, i) => ({
        model,
        provider: inferProvider(model),
        filename: image.filename,
        rep: i + 1,
      })),
    ),
  );

  const pending: RunCell[] = [];
  for (const cell of allCells) {
    const image = byFilename.get(cell.filename);
    if (!image) throw new Error(`Internal: no ground truth for ${cell.filename}`);
    if (values.force || !(await isCellComplete(dataset, cell, image, effort, fidelity))) {
      pending.push(cell);
    }
  }
  console.log(
    `${allCells.length} cells total, ${allCells.length - pending.length} already complete, ${pending.length} to run.`,
  );
  if (pending.length === 0) return;

  for (const provider of new Set(pending.map((c) => c.provider))) {
    const envVar = API_KEY_ENV[provider];
    if (!process.env[envVar]) {
      throw new Error(
        `Missing ${envVar} for provider "${provider}". Set it or filter models with --models.`,
      );
    }
  }

  const callCount = (cell: RunCell): number => {
    const image = byFilename.get(cell.filename);
    return image ? callsForImage(image).length : 1;
  };
  const totalCalls = pending.reduce((sum, cell) => sum + callCount(cell), 0);
  if (
    !values.yes &&
    !(await confirmSweep(pending.length, totalCalls, estimateSweepCost(pending, callCount)))
  ) {
    console.log("Aborted.");
    return;
  }

  const imageBytes = new Map<string, Buffer>();
  for (const image of images) {
    imageBytes.set(image.filename, await readFile(join(dataset.dir, image.filename)));
  }

  const clients = new Map<string, VisualAIClient>();
  for (const model of models) {
    clients.set(
      model,
      visualAI({
        model,
        reasoningEffort: effort,
        imageDetail: fidelity,
        maxTokens: visibilityBenchConfig.maxTokens,
      }),
    );
  }

  let completed = 0;
  let failed = 0;
  const byProvider = new Map<ProviderName, RunCell[]>();
  for (const cell of pending) {
    const list = byProvider.get(cell.provider) ?? [];
    list.push(cell);
    byProvider.set(cell.provider, list);
  }

  const abortedProviders = new Set<ProviderName>();
  const providerPools = [...byProvider.entries()].map(([provider, cells]) => {
    const tasks = cells.map((cell) => async () => {
      if (abortedProviders.has(provider)) return;
      const client = clients.get(cell.model);
      const bytes = imageBytes.get(cell.filename);
      const image = byFilename.get(cell.filename);
      if (!client || !bytes || !image) {
        throw new Error(`Internal: missing client or image for ${cell.model}/${cell.filename}`);
      }
      let record: VisibilityRunRecord;
      try {
        record = await executeCell(cell, client, bytes, image, effort, fidelity);
      } catch (error) {
        // Auth/config errors doom every remaining cell for this provider — stop early.
        abortedProviders.add(provider);
        throw error;
      }
      await atomicWriteJson(recordPath(dataset, cell, effort, fidelity), record);
      completed++;
      if (record.status === "ok") {
        const cost = record.usage?.reportedCost ?? record.usage?.estimatedCost;
        const duration = record.usage?.durationSeconds;
        const breakdown = record.calls
          .map((c) => {
            const statements = c.result?.statements ?? [];
            return `${c.mode} ${statements.filter((s) => s.pass).length}/${statements.length}`;
          })
          .join(", ");
        console.log(
          `[${completed}/${pending.length}] ${cell.model} ${cell.filename} rep ${cell.rep} ok` +
            ` (${duration !== undefined ? `${duration.toFixed(1)}s` : "?s"}, ${cost !== undefined ? `$${cost.toFixed(4)}` : "$?"}, ${breakdown} passed)`,
        );
      } else {
        failed++;
        console.error(
          `[${completed}/${pending.length}] ${cell.model} ${cell.filename} rep ${cell.rep} FAILED: ${record.error?.message ?? "unknown"}`,
        );
      }
    });
    return runPool(tasks, concurrencyPerProvider).then((results) => ({ provider, results }));
  });

  const settled = await Promise.all(providerPools);
  for (const { provider, results } of settled) {
    const fatal = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (fatal) {
      const reason = fatal.reason instanceof Error ? fatal.reason.message : String(fatal.reason);
      console.error(`Provider "${provider}" aborted: ${reason}`);
      process.exitCode = 1;
    }
  }

  console.log(`Done. ${completed - failed} ok, ${failed} failed. Records in ${runsDir(dataset)}`);
  if (failed > 0) {
    console.log(
      'Failed cells wrote status:"error" records and will be retried on the next visibility:run.',
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
