import "dotenv/config";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { BENCH_PROMPT, benchConfig } from "../bench.config.js";
import { JUDGE_PROMPT_VERSION, createJudgeCompletion, judgeRun } from "./judge.js";
import { ensureManifest } from "./manifest.js";
import { computeModelMetrics, sortLeaderboard } from "./metrics.js";
import {
  OverridesSchema,
  RunRecordSchema,
  type JudgeVerdict,
  type Manifest,
  type Overrides,
  type ResolvedCell,
  type RunRecord,
  type Scores,
} from "./types.js";
import {
  RESULTS_DIR,
  atomicWriteJson,
  modelDirName,
  readJsonIfExists,
  runPool,
  sha256,
} from "./util.js";

const RUNS_DIR = join(RESULTS_DIR, "runs");
export const OVERRIDES_PATH = join(RESULTS_DIR, "overrides.json");

/** Per-judge scores file, so multiple judges' scorings coexist side by side. */
export function scoresPathForJudge(judgeModel: string): string {
  return join(RESULTS_DIR, `scores.${modelDirName(judgeModel)}.json`);
}

export interface ScorableRecords {
  records: RunRecord[];
  /** Models with on-disk records that are not in the current roster. */
  skippedModels: Set<string>;
  /** Image IDs with on-disk records that are retired or unknown in the manifest. */
  skippedImages: Set<string>;
}

/**
 * Keep only records for roster models and active manifest images. Records for
 * retired images or de-rostered models stay on disk but are excluded here.
 */
export function filterScorableRecords(
  allRecords: readonly RunRecord[],
  manifest: Manifest,
  models: readonly string[],
): ScorableRecords {
  const activeImages = new Set(manifest.entries.map((e) => e.imageId));
  const records: RunRecord[] = [];
  const skippedModels = new Set<string>();
  const skippedImages = new Set<string>();
  for (const record of allRecords) {
    if (!models.includes(record.model)) {
      skippedModels.add(record.model);
      continue;
    }
    if (!activeImages.has(record.imageId)) {
      skippedImages.add(record.imageId);
      continue;
    }
    records.push(record);
  }
  return { records, skippedModels, skippedImages };
}

async function loadRunRecords(): Promise<RunRecord[]> {
  const records: RunRecord[] = [];
  let modelDirs: string[];
  try {
    modelDirs = await readdir(RUNS_DIR);
  } catch {
    return records;
  }
  for (const model of modelDirs) {
    let imageDirs: string[];
    try {
      imageDirs = await readdir(join(RUNS_DIR, model));
    } catch {
      continue;
    }
    for (const imageId of imageDirs) {
      const files = await readdir(join(RUNS_DIR, model, imageId));
      for (const file of files.filter((f) => f.endsWith(".json"))) {
        const raw = await readJsonIfExists(join(RUNS_DIR, model, imageId, file));
        const parsed = RunRecordSchema.safeParse(raw);
        if (parsed.success) {
          records.push(parsed.data);
        } else {
          console.warn(`Skipping unparseable run record: ${model}/${imageId}/${file}`);
        }
      }
    }
  }
  return records;
}

export function overrideKey(cell: Pick<ResolvedCell, "model" | "imageId" | "rep">): string {
  return `${cell.model}/${cell.imageId}/rep_${cell.rep}`;
}

/** Merge a judge verdict with manual overrides into the final resolved cell. */
export function resolveCell(
  record: RunRecord,
  verdict: JudgeVerdict | undefined,
  overrides: Overrides,
): ResolvedCell {
  const reportedIssues = record.result?.issues ?? [];
  const cellOverride = overrides[overrideKey(record)];
  let overridden = false;

  const expected = (verdict?.expected ?? []).map((entry) => {
    const forced = cellOverride?.expected?.[String(entry.expectedIndex)];
    const found = forced ? forced === "found" : entry.found;
    const isOverridden = forced !== undefined && found !== entry.found;
    if (isOverridden) overridden = true;
    return {
      expectedIndex: entry.expectedIndex,
      found,
      matchedReportedIndexes: entry.matchedReportedIndexes,
      reasoning: isOverridden
        ? `Manually overridden. Judge said: ${entry.reasoning}`
        : entry.reasoning,
      overridden: isOverridden,
    };
  });

  let extraReportedIndexes = verdict?.extraReportedIndexes ?? [];
  if (cellOverride?.extras) {
    const forcedExtra = new Set(extraReportedIndexes);
    for (const [indexText, state] of Object.entries(cellOverride.extras)) {
      const index = Number(indexText);
      if (!Number.isInteger(index) || index < 0 || index >= reportedIssues.length) continue;
      const wasExtra = forcedExtra.has(index);
      if (state === "extra" && !wasExtra) {
        forcedExtra.add(index);
        overridden = true;
      } else if (state === "not-extra" && wasExtra) {
        forcedExtra.delete(index);
        overridden = true;
      }
    }
    extraReportedIndexes = [...forcedExtra].sort((a, b) => a - b);
  }

  return {
    model: record.model,
    imageId: record.imageId,
    rep: record.rep,
    status: record.status,
    reportedIssues,
    summary: record.result?.summary,
    expected,
    extraReportedIndexes,
    overridden,
    usage: record.usage,
    error: record.error ? { name: record.error.name, message: record.error.message } : undefined,
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      // Judge calls are cheap text-only requests; cached verdicts never hit the API.
      concurrency: { type: "string", default: "8" },
      judge: { type: "string" },
    },
  });
  const judgeModel = values.judge ?? benchConfig.judgeModel;

  const manifest: Manifest = await ensureManifest();
  // Only the configured roster and active (non-retired) images are scored;
  // other records stay on disk but are excluded from scores and reports.
  const allRecords = await loadRunRecords();
  const { records, skippedModels, skippedImages } = filterScorableRecords(
    allRecords,
    manifest,
    benchConfig.models,
  );
  for (const model of skippedModels) {
    console.log(`Skipping records for "${model}" (not in benchConfig.models)`);
  }
  for (const imageId of skippedImages) {
    console.log(`Skipping records for retired image ${imageId}`);
  }
  if (records.length === 0) {
    throw new Error(`No run records found in ${RUNS_DIR}. Run "pnpm bench:run" first.`);
  }

  const overridesRaw = await readJsonIfExists(OVERRIDES_PATH);
  const overrides: Overrides =
    overridesRaw === undefined ? {} : OverridesSchema.parse(overridesRaw);
  const knownKeys = new Set(records.map((r) => overrideKey(r)));
  for (const key of Object.keys(overrides)) {
    if (!knownKeys.has(key)) console.warn(`overrides.json references unknown run cell: ${key}`);
  }

  const expectedByImage = new Map(manifest.entries.map((e) => [e.imageId, e.expectedIssues]));

  console.log(`Judging with ${judgeModel} (cached verdicts are reused).`);
  const completion = createJudgeCompletion(judgeModel);
  let judged = 0;
  const tasks = records.map((record) => async (): Promise<ResolvedCell> => {
    if (record.status !== "ok" || !record.result) {
      return resolveCell(record, undefined, overrides);
    }
    const expectedIssues = expectedByImage.get(record.imageId);
    if (!expectedIssues) throw new Error(`Run record references unknown image ${record.imageId}`);
    const verdict = await judgeRun(
      { expectedIssues, reportedIssues: record.result.issues },
      { judgeModel, completion },
    );
    judged++;
    if (judged % 25 === 0) console.log(`  judged ${judged} runs...`);
    return resolveCell(record, verdict, overrides);
  });

  const settled = await runPool(tasks, Number(values.concurrency));
  const failures = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failures.length > 0) {
    const first: unknown = failures[0]?.reason;
    throw new Error(
      `${failures.length} runs failed to score. First error: ${first instanceof Error ? first.message : String(first)}`,
    );
  }
  const cells = settled
    .filter((r): r is PromiseFulfilledResult<ResolvedCell> => r.status === "fulfilled")
    .map((r) => r.value)
    .sort(
      (a, b) =>
        a.model.localeCompare(b.model) || a.imageId.localeCompare(b.imageId) || a.rep - b.rep,
    );

  const providerByModel = new Map(records.map((r) => [r.model, r.provider]));
  const models = [...new Set(records.map((r) => r.model))].map((model) =>
    computeModelMetrics(model, providerByModel.get(model) ?? "unknown", cells, manifest),
  );

  const scores: Scores = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    prompt: BENCH_PROMPT,
    promptHash: sha256(BENCH_PROMPT),
    reasoningEffort: benchConfig.reasoningEffort,
    repeats: benchConfig.repeats,
    judgeModel,
    judgePromptVersion: JUDGE_PROMPT_VERSION,
    overrideCount: Object.keys(overrides).length,
    models: sortLeaderboard(models),
    cells,
  };
  const scoresPath = scoresPathForJudge(judgeModel);
  await atomicWriteJson(scoresPath, scores);
  console.log(`Scored ${cells.length} runs across ${models.length} models -> ${scoresPath}`);
  console.log(`Next: pnpm bench:report`);
}

const isDirectRun = process.argv[1]?.endsWith("score.ts") ?? false;
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
