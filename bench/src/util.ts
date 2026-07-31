import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { MODEL_TO_PROVIDER } from "../../src/constants.js";
import type { ProviderName } from "../../src/types.js";
import { activeDataset } from "./dataset.js";

/** Directory of the screenshots under test, for the active dataset. */
export function datasetDir(): string {
  return activeDataset().dir;
}

/** Where every generated artifact for the active dataset lands. */
export function resultsDir(): string {
  return activeDataset().resultsDir;
}

/**
 * Run records live under a per-prompt-variant subdirectory so runs from
 * different prompts coexist:
 * results/<dataset>/runs/<variant>/<model>/<imageId>/rep_N.json.
 */
export function runsDirForVariant(variant: string): string {
  return join(resultsDir(), "runs", variant);
}

/**
 * Per-(variant, judge) scores file. The variant is the dot-free first segment;
 * the judge slug follows and may itself contain dots ("gpt-5.4-mini").
 */
export function scoresPathForVariantJudge(variant: string, judgeModel: string): string {
  return join(resultsDir(), `scores.${variant}.${modelDirName(judgeModel)}.json`);
}

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Directory- and URL-safe name for a model or judge id. OpenRouter slugs contain
 * "/" ("x-ai/grok-4.5"), which would otherwise nest an extra path level under
 * results/runs/ and break record discovery; embedding judge ids contain ":"
 * ("embed:bge-small"), which a browser parses as a URL scheme and so breaks
 * report links. Records/scores still store the true name; only on-disk names and
 * hrefs use this form.
 */
export function modelDirName(model: string): string {
  return model.replaceAll("/", "__").replaceAll(":", "__");
}

/**
 * The reasoning effort whose runs keep the bare model directory and bare series
 * id. It anchors the existing sweep: all runs recorded before effort became a
 * first-class axis used "medium", so keeping medium unsuffixed means those 1800+
 * records need no migration. Other efforts are suffixed so they coexist.
 */
export const PRIMARY_EFFORT = "medium";

/**
 * Image-fidelity value whose runs keep the bare model dir / bare series id.
 * "auto" is the library default (no detail field sent), so treating it as
 * primary means all runs recorded before fidelity became an axis need no
 * migration and keep their existing series ids.
 */
export const PRIMARY_FIDELITY = "auto";

/**
 * Stable identity for a (model, reasoning-effort, image-fidelity) run
 * configuration across scoring and reporting — the "series". Everywhere the
 * pipeline used to key on the bare model, it now keys on this so one model can
 * hold several efforts/fidelities at once. Primary values (medium effort, auto
 * fidelity) add no suffix, so prior scores/series stay byte-identical; other
 * values are appended as parenthetical tags, e.g. `gpt-5.6-luna (xhigh, high-res)`.
 */
export function seriesId(
  model: string,
  reasoningEffort: string,
  imageFidelity: string = PRIMARY_FIDELITY,
): string {
  const tags: string[] = [];
  if (reasoningEffort !== PRIMARY_EFFORT) tags.push(reasoningEffort);
  if (imageFidelity !== PRIMARY_FIDELITY) tags.push(`${imageFidelity}-res`);
  return tags.length > 0 ? `${model} (${tags.join(", ")})` : model;
}

/**
 * On-disk run directory for a (model, effort, fidelity) configuration, under
 * results/runs/<variant>/. Primary values keep the bare model dir (no migration
 * of existing runs); non-primary effort gets an "@<effort>" suffix and
 * non-primary fidelity a distinct "@fid-<fidelity>" suffix so the two axes never
 * collide. The record's own fields remain the source of truth — the directory
 * name is storage only.
 */
export function runModelDir(
  model: string,
  reasoningEffort: string,
  imageFidelity: string = PRIMARY_FIDELITY,
): string {
  let dir = modelDirName(model);
  if (reasoningEffort !== PRIMARY_EFFORT) dir += `@${reasoningEffort}`;
  if (imageFidelity !== PRIMARY_FIDELITY) dir += `@fid-${imageFidelity}`;
  return dir;
}

/**
 * Map a model name to its provider. Lives here (not run.ts) because run.ts
 * executes a sweep on import and must never be imported by other modules.
 */
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

/** Write JSON atomically (tmp file + rename) so interrupted sweeps never leave partial records. */
export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmpPath, filePath);
}

export async function readJsonIfExists(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

/** Run tasks with a fixed concurrency limit. Rejections propagate after all tasks settle. */
export async function runPool<T>(
  tasks: readonly (() => Promise<T>)[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array<PromiseSettledResult<T>>(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    for (;;) {
      const index = next++;
      const task = tasks[index];
      if (!task) return;
      try {
        results[index] = { status: "fulfilled", value: await task() };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export interface RetryOptions {
  maxAttempts: number;
  /** Decide whether an error is transient and worth retrying. */
  isRetryable: (error: unknown) => boolean;
  baseDelayMs?: number;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const baseDelayMs = options.baseDelayMs ?? 2000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === options.maxAttempts || !options.isRetryable(error)) throw error;
      const delayMs = baseDelayMs * 2 ** (attempt - 1) * (0.5 + Math.random());
      options.onRetry?.(error, attempt, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const lower = sorted[mid - 1];
  const upper = sorted[mid];
  return lower === undefined || upper === undefined ? null : (lower + upper) / 2;
}

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? null;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
