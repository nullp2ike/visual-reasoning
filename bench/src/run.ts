import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { visualAI } from "../../src/index.js";
import type { VisualAIClient } from "../../src/index.js";
import {
  VisualAIAuthError,
  VisualAIConfigError,
  VisualAIProviderError,
  VisualAIRateLimitError,
} from "../../src/errors.js";
import { MODEL_TO_PROVIDER } from "../../src/constants.js";
import { calculateCost } from "../../src/core/pricing.js";
import type { ProviderName } from "../../src/types.js";
import { BENCH_PROMPT, benchConfig } from "../bench.config.js";
import { ensureManifest } from "./manifest.js";
import { RunRecordSchema, type Manifest, type RunRecord } from "./types.js";
import {
  GOLDEN_DIR,
  RESULTS_DIR,
  atomicWriteJson,
  modelDirName,
  readJsonIfExists,
  retryWithBackoff,
  runPool,
  sha256,
} from "./util.js";

const RUNS_DIR = join(RESULTS_DIR, "runs");

interface RunCell {
  model: string;
  provider: ProviderName;
  imageId: string;
  filename: string;
  rep: number;
}

export function inferProvider(model: string): ProviderName {
  const known = MODEL_TO_PROVIDER.get(model);
  if (known) return known;
  if (model.startsWith("claude-")) return "anthropic";
  if (/^(gpt-|o\d)/.test(model)) return "openai";
  if (model.startsWith("gemini-")) return "google";
  // Vendor-prefixed slugs ("x-ai/grok-4.5") route through OpenRouter.
  if (model.includes("/")) return "openrouter";
  throw new Error(`Cannot infer provider for model "${model}"`);
}

function recordPath(cell: Pick<RunCell, "model" | "imageId" | "rep">): string {
  return join(RUNS_DIR, modelDirName(cell.model), cell.imageId, `rep_${cell.rep}.json`);
}

/** A cell is complete when its record exists, parses, succeeded, and matches the frozen prompt. */
async function isCellComplete(cell: RunCell, promptHash: string): Promise<boolean> {
  const raw = await readJsonIfExists(recordPath(cell));
  if (raw === undefined) return false;
  const parsed = RunRecordSchema.safeParse(raw);
  return parsed.success && parsed.data.status === "ok" && parsed.data.promptHash === promptHash;
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

// Rough per-call token guess for the pre-sweep cost estimate only.
const ESTIMATE_INPUT_TOKENS = 2500;
const ESTIMATE_OUTPUT_TOKENS = 800;

function estimateSweepCost(cells: readonly RunCell[]): number | undefined {
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
      total += cost;
      priced++;
    }
  }
  return priced > 0 ? total * (cells.length / priced) : undefined;
}

async function executeCell(
  cell: RunCell,
  client: VisualAIClient,
  imageBytes: Buffer,
  promptHash: string,
): Promise<RunRecord> {
  const base = {
    schemaVersion: 1 as const,
    model: cell.model,
    provider: cell.provider,
    imageId: cell.imageId,
    rep: cell.rep,
    promptHash,
    reasoningEffort: benchConfig.reasoningEffort,
    timestamp: new Date().toISOString(),
  };
  try {
    const result = await retryWithBackoff(() => client.ask(imageBytes, BENCH_PROMPT), {
      maxAttempts: benchConfig.maxAttempts,
      isRetryable: isTransient,
      onRetry: (error, attempt, delayMs) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `  retry ${attempt}/${benchConfig.maxAttempts - 1} for ${cell.model}/${cell.imageId}/rep_${cell.rep} in ${Math.round(delayMs / 1000)}s: ${message}`,
        );
      },
    });
    return {
      ...base,
      status: "ok",
      result: { summary: result.summary, issues: result.issues },
      usage: result.usage,
    };
  } catch (error) {
    if (error instanceof VisualAIAuthError || error instanceof VisualAIConfigError) throw error;
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      ...base,
      status: "error",
      error: { name: err.name, message: err.message, attempts: benchConfig.maxAttempts },
    };
  }
}

async function confirmSweep(cellCount: number, estimate: number | undefined): Promise<boolean> {
  const estimateText = estimate === undefined ? "unknown" : `~$${estimate.toFixed(2)}`;
  console.log(`About to execute ${cellCount} model calls (estimated cost ${estimateText}).`);
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
      models: { type: "string" },
      images: { type: "string" },
      force: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
    },
  });

  const manifest: Manifest = await ensureManifest(values.force);
  const promptHash = sha256(BENCH_PROMPT);

  const modelFilter = values.models?.split(",").map((m) => m.trim());
  const imageFilter = values.images?.split(",").map((i) => i.trim());
  const models = benchConfig.models.filter((m) => !modelFilter || modelFilter.includes(m));
  const entries = manifest.entries.filter((e) => !imageFilter || imageFilter.includes(e.imageId));
  if (models.length === 0 || entries.length === 0) {
    throw new Error("Filters matched no models or no images");
  }

  const allCells: RunCell[] = models.flatMap((model) =>
    entries.flatMap((entry) =>
      Array.from({ length: benchConfig.repeats }, (_, i) => ({
        model,
        provider: inferProvider(model),
        imageId: entry.imageId,
        filename: entry.filename,
        rep: i + 1,
      })),
    ),
  );

  const pending: RunCell[] = [];
  for (const cell of allCells) {
    if (values.force || !(await isCellComplete(cell, promptHash))) pending.push(cell);
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

  if (!values.yes && !(await confirmSweep(pending.length, estimateSweepCost(pending)))) {
    console.log("Aborted.");
    return;
  }

  // Image bytes are keyed by anonymous ID; only bytes ever reach the model.
  const imageBytes = new Map<string, Buffer>();
  for (const entry of entries) {
    imageBytes.set(entry.imageId, await readFile(join(GOLDEN_DIR, entry.filename)));
  }

  const clients = new Map<string, VisualAIClient>();
  for (const model of models) {
    clients.set(model, visualAI({ model, reasoningEffort: benchConfig.reasoningEffort }));
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
      const bytes = imageBytes.get(cell.imageId);
      if (!client || !bytes)
        throw new Error(`Internal: missing client or image for ${cell.model}/${cell.imageId}`);
      let record: RunRecord;
      try {
        record = await executeCell(cell, client, bytes, promptHash);
      } catch (error) {
        // Auth/config errors doom every remaining cell for this provider — stop early.
        abortedProviders.add(provider);
        throw error;
      }
      await atomicWriteJson(recordPath(cell), record);
      completed++;
      if (record.status === "ok") {
        const cost = record.usage?.estimatedCost;
        const duration = record.usage?.durationSeconds;
        console.log(
          `[${completed}/${pending.length}] ${cell.model} ${cell.imageId} rep ${cell.rep} ok` +
            ` (${duration !== undefined ? `${duration.toFixed(1)}s` : "?s"}, ${cost !== undefined ? `$${cost.toFixed(4)}` : "$?"}, ${record.result?.issues.length ?? 0} issues)`,
        );
      } else {
        failed++;
        console.error(
          `[${completed}/${pending.length}] ${cell.model} ${cell.imageId} rep ${cell.rep} FAILED: ${record.error?.message ?? "unknown"}`,
        );
      }
    });
    return runPool(tasks, benchConfig.concurrencyPerProvider).then((results) => ({
      provider,
      results,
    }));
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

  console.log(`Done. ${completed - failed} ok, ${failed} failed. Records in ${RUNS_DIR}`);
  if (failed > 0) {
    console.log(
      'Failed cells wrote status:"error" records and will be retried on the next bench:run.',
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
