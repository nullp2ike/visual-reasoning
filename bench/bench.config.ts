import type { ImageDetailLevel, ReasoningEffortLevel } from "../src/constants.js";

/**
 * Named prompt variants under test. Each is fed verbatim to every model via
 * `ask()`, and its sha256 is stamped into the run records it produces, so
 * runs from different variants never collide. Variant ids must be dot-free
 * (they become the first segment of `scores.<variant>.<judge>.json`).
 *
 * - `baseline` is the original frozen question. Its wording anchors the
 *   manifest promptHash, so it must not change without regenerating runs. It is
 *   dataset-agnostic and is the anchor every exclusion variant is measured against.
 *
 * Exclusion variants are **dataset-specific** and are named `excluded-<dataset>`.
 * A dataset's UI has its own recurring non-defects, so one shared list cannot
 * serve two datasets: wording that suppresses noise in one will suppress real
 * ground-truth defects in another. Derive each list from the false positives
 * models report on that dataset's **negative control** — anything reported on a
 * screenshot with no expected issues is by definition noise — and then check the
 * candidate list against every expected issue before adopting it.
 *
 * - `excluded` is the list for the `primary` dataset (clipping/overflow,
 *   low-contrast legal text, sticky-nav/overlay occlusion, the "SCROLL DOWN"
 *   indicator, cramped spacing). It predates this naming convention and keeps
 *   its bare id because `results/primary/runs/excluded/` already holds runs
 *   under it. Do NOT reuse it for other datasets: against
 *   `golden` it would suppress 4 of the 17 expected defects, because
 *   there clipping, overlap, and alignment are real ground truth.
 * - `excluded-golden-v2` is the list for `golden`: the two
 *   scroll/viewport-edge bullets only, which were ~84% of the clean control's
 *   noise on their own, framed as "features, not defects". Everything narrower
 *   than that is deliberately omitted. Its predecessor (`excluded-golden`, now
 *   removed) named four categories and cut mean extras/run 1.89 -> 0.28 but
 *   also dropped mean recall 66.8% -> 58.1%: the more categories an exclusion
 *   list names, the more conservative models become beyond them, and narrow
 *   wording ("cut off mid-word inside its own container") became a loophole
 *   models used to keep reporting the carousel clip anyway. Any
 *   `results/golden/runs/excluded-golden/` records on disk are
 *   orphaned and can be deleted.
 */
export const BENCH_PROMPT_VARIANTS = {
  baseline: "What looks visually broken on this page?",
  excluded: `What looks visually broken on this page?

Do not report the following (treat these as out of scope, not defects):
- Game cards, tiles, or other content clipped or cut off at a screen edge, or the page appearing to overflow horizontally.
- Small or low-contrast legal / disclaimer / fine-print text being hard to read.
- A fixed or sticky bottom navigation bar, or any overlay, covering or overlapping page content.
- A "SCROLL DOWN" indicator or scroll-prompt overlay.
- Inconsistent or tight spacing, padding, margins, or alignment, or a generally cramped layout.`,
  "excluded-golden-v2": `What looks visually broken on this page?

Do not report the following (treat these as features, not defects):
- A horizontally scrollable row (restaurant carousels, category filter chips) whose last item is only partially visible at the right screen edge, including that item's title being clipped by the edge.
- Content cut off by the bottom of the viewport, such as a partially visible card at the end of a vertical list.`,
} as const;

export type PromptVariantId = keyof typeof BENCH_PROMPT_VARIANTS;

/** All variant ids in display order (baseline first). */
export const PROMPT_VARIANT_IDS = Object.keys(BENCH_PROMPT_VARIANTS) as PromptVariantId[];

/** The variant used when `--prompt` is omitted; also the report's default view. */
export const DEFAULT_PROMPT_VARIANT: PromptVariantId = "baseline";

export function isPromptVariantId(value: string): value is PromptVariantId {
  return value in BENCH_PROMPT_VARIANTS;
}

/**
 * Baseline prompt. Anchors the manifest promptHash and keeps back-compat for
 * importers (e.g. `manifest.ts`) that only need the frozen baseline question.
 */
export const BENCH_PROMPT = BENCH_PROMPT_VARIANTS[DEFAULT_PROMPT_VARIANT];

export interface BenchConfig {
  /**
   * Default dataset: a directory name under `bench/datasets/`, or a path to a
   * dataset directory anywhere on disk. Override per run with `--dataset`, or
   * for good with `BENCH_DATASET` in `.env`. Results are namespaced by dataset,
   * so switching datasets never mixes manifests, runs, or reports.
   *
   * Datasets are tracked apart from `primary`, which is gitignored because its
   * screenshots are private product UI. See bench/datasets/README.md.
   */
  readonly dataset: string;
  /** Models under test. Provider is inferred from the model name by the library. */
  readonly models: readonly string[];
  /** Repeat runs per model x image, for consistency measurement. */
  readonly repeats: number;
  /** Fixed reasoning effort applied to every model under test. */
  readonly reasoningEffort: ReasoningEffortLevel;
  /** Default image-fidelity hint; overridable per run with `--fidelity`. */
  readonly imageFidelity: ImageDetailLevel;
  /**
   * Output token budget per call. Reasoning tokens share this budget on Gemini
   * "thinking" models, so heavy reasoners (e.g. gemini-3.1-pro-preview) can
   * truncate with finishReason MAX_TOKENS at the library default (4096) on the
   * longer excluded prompt. Doubled to 8192 to let those runs finish.
   */
  readonly maxTokens: number;
  /**
   * Text-only judge that matches reported issues against expected issues.
   * Either an LLM model name (provider inferred, e.g. "claude-haiku-4-5",
   * "gpt-5.6-terra") or a local embedding judge id of the form "embed:<id>"
   * (e.g. "embed:bge-small"). Embedding judges run fully locally via
   * Transformers.js and threshold cosine similarity — see bench/discovery/src/embed.ts and
   * `pnpm discovery:calibrate-embed`. Select per run with `discovery:score --judge <id>`.
   *
   * Whichever judge is named here also owns the canonical `RESULTS.md` and
   * `report.html`; every other judge's reports are written under its own
   * `RESULTS.<variant>.<judge>.md` / `report.<judge>.html`.
   */
  readonly judgeModel: string;
  /**
   * Concurrent in-flight requests per provider during a sweep.
   * Note: all OpenRouter-routed models (xAI, Moonshot, Qwen) share a single
   * "openrouter" pool since rate limits apply per API key.
   */
  readonly concurrencyPerProvider: number;
  /** Max attempts per run cell (1 initial + retries) on transient provider errors. */
  readonly maxAttempts: number;
}

export const benchConfig: BenchConfig = {
  dataset: "golden",
  models: [
    // Anthropic: flagship / mid / small
    "claude-fable-5",
    "claude-opus-5",
    "claude-opus-4-8",
    "claude-sonnet-5",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    // OpenAI: flagship / mini + 5.6 variants
    "gpt-5.5",
    "gpt-5.4-mini",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    // Google: pro / flash / flash-lite
    "gemini-3.1-pro-preview",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    // OpenRouter: Meta, xAI, Moonshot, Qwen, Z.ai (all vision-capable; slugs are
    // vendor-prefixed and routed through the openrouter provider).
    // Note: qwen3.8-max is the first Max tier to accept image input (3.6-max
    // and 3.7-max are text-only on OpenRouter).
    //
    // qwen3.8-max must be run with `--effort low`. OpenRouter maps effort
    // medium/high onto a fixed thinking_budget of 32768 for this model, and
    // upstream rejects the call unless max_completion_tokens exceeds it
    // ("max_completion_tokens [8192] must be greater than thinking_budget
    // [32768]"). Raising maxTokens past 32768 does make the call succeed
    // (40960 returns finish_reason "stop" with valid JSON), but the result is
    // not comparable: at medium this model burns ~7100 reasoning tokens per
    // call at ~199s, against a board median of ~358 tokens and under 20s for
    // every other model at medium. Effort low costs ~582 reasoning tokens at
    // ~32s, which sits mid-pack among the medium-effort models -- so `low` is
    // the closer analogue to what the rest of the roster is doing, not a
    // handicap. Keep it at `--effort low`; it benches as its own `(low)` row.
    //
    // qwen3.6-flash is deliberately absent: with response_format json_schema
    // it returns HTTP 200 and an empty content string, which surfaces as
    // "Failed to parse AI response as JSON". It generates text normally
    // without the schema, so it is incompatible with the library's
    // structured-output contract rather than with image input. Re-add it only
    // if that contract is relaxed.
    // Age-gated on OpenRouter: returns HTTP 403 until the account completes the
    // 18+ confirmation at openrouter.ai/settings/preferences. Unconfirmed
    // accounts will see every muse-spark cell fail the sweep. Reasons by
    // default even with no effort configured (~370-814 reasoning tokens/call),
    // so its cost per run sits above the headline $1.25/$4.25 rate suggests.
    "meta/muse-spark-1.3",
    "x-ai/grok-4.6",
    "x-ai/grok-4.5",
    "moonshotai/kimi-k3",
    "moonshotai/kimi-k2.7-code",
    "qwen/qwen3.8-max",
    "qwen/qwen3.7-plus",
    // Cheapest row on the board ($0.15/$0.50 per MTok) and the only one under
    // qwen3.6-flash on both sides. Reasons by default (~190 tokens/call with
    // no effort configured), so its cost per run runs a little above the
    // headline rate.
    "z-ai/glm-5.3-flash",
  ],
  repeats: 5,
  reasoningEffort: "medium",
  imageFidelity: "auto",
  maxTokens: 8192,
  judgeModel: "gpt-5.6-luna",
  // Rate-limit errors retry with backoff and failed cells resume on the next
  // run, so this can be raised safely; override per-run with --concurrency.
  concurrencyPerProvider: 6,
  maxAttempts: 3,
};
