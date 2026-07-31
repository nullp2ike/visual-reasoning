import type { ImageDetailLevel, ReasoningEffortLevel } from "../src/constants.js";

/**
 * Named prompt variants under test. Each is fed verbatim to every model via
 * `ask()`, and its sha256 is stamped into the run records it produces, so
 * runs from different variants never collide. Variant ids must be dot-free
 * (they become the first segment of `scores.<variant>.<judge>.json`).
 *
 * - `baseline` is the original frozen question. Its wording anchors the
 *   manifest promptHash, so it must not change without regenerating runs.
 * - `excluded` keeps the baseline question verbatim, then appends an explicit
 *   "out of scope" list for the five noise themes models most often reported
 *   that are not real defects (clipping/overflow, low-contrast legal text,
 *   sticky-nav/overlay occlusion, the "SCROLL DOWN" indicator, cramped spacing).
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
   * Transformers.js and threshold cosine similarity — see bench/src/embed.ts and
   * `pnpm bench:calibrate-embed`. Select per run with `bench:score --judge <id>`.
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
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    // OpenRouter: xAI, Moonshot, Qwen (all vision-capable; slugs are
    // vendor-prefixed and routed through the openrouter provider).
    // Note: qwen3.7-max is text-only on OpenRouter and qwen "3.7 Omni-Flash"
    // does not exist; qwen3.6-flash is the flash-tier vision substitute.
    "x-ai/grok-4.5",
    "moonshotai/kimi-k3",
    "moonshotai/kimi-k2.7-code",
    "qwen/qwen3.7-plus",
    "qwen/qwen3.6-flash",
  ],
  repeats: 5,
  reasoningEffort: "medium",
  imageFidelity: "auto",
  maxTokens: 8192,
  judgeModel: "claude-haiku-4-5",
  // Rate-limit errors retry with backoff and failed cells resume on the next
  // run, so this can be raised safely; override per-run with --concurrency.
  concurrencyPerProvider: 6,
  maxAttempts: 3,
};
