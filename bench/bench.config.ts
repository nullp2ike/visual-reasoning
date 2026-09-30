import type { ImageDetailLevel, ReasoningEffortLevel } from "../src/constants.js";

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
   * Text-only LLM judge that matches reported issues against expected issues.
   * A model name with the provider inferred (e.g. "gpt-5.6-luna",
   * "gemini-3.8-flash"). Select per run with `discovery:score --judge <id>`.
   *
   * Whichever judge is named here also owns the canonical `RESULTS.md` and
   * `report.html`; every judge's reports are also written under its own
   * `RESULTS.<judge>.md` / `report.<judge>.html`.
   */
  readonly judgeModel: string;
  /**
   * The judge whose recall ranking picks the models every discovery report
   * shows by default, so all judges' reports open on the same models. Falls
   * back to `judgeModel` when this judge has no scores for the dataset.
   */
  readonly reportRankJudge: string;
  /** How many top models a report shows by default; its model filter shows the rest. */
  readonly reportDefaultModels: number;
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
    "claude-fable-5-1",
    "claude-fable-5",
    "claude-opus-5-5",
    "claude-opus-5",
    "claude-opus-4-8",
    "claude-sonnet-5-5",
    "claude-sonnet-5",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    // OpenAI: GPT-6 Astra, GPT-6.1 Sol, GPT-6 Sol/Luna, flagship / mini + 5.6 variants.
    // Astra is gated behind OpenAI's Trusted Access Program; keys without
    // access fail every cell with a VisualAIProviderError naming the model.
    "gpt-6-astra",
    "gpt-6.1-sol",
    "gpt-6-sol",
    "gpt-6-luna",
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
    // qwen3.8-max is the heaviest reasoner in the roster at medium: ~3,200
    // reasoning tokens and a ~78s median per call on golden, against a board
    // median under 16s. It used to need `--effort low`, because OpenRouter
    // rejected medium unless max_completion_tokens exceeded a fixed 32768
    // thinking budget; that no longer happens, so it runs at medium like the
    // rest of the roster.
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
    "x-ai/grok-4.7",
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
    // Xiaomi flagship (1T+ params). Served by two fp8 upstreams at the same
    // price; DeepInfra's throughput (~4 tok/s p50) is far below Xiaomi's own
    // (~36 tok/s), so latency here depends on which host OpenRouter picks.
    "xiaomi/mimo-v2.6-pro",
  ],
  repeats: 5,
  reasoningEffort: "medium",
  imageFidelity: "auto",
  maxTokens: 8192,
  judgeModel: "gpt-5.6-luna",
  reportRankJudge: "gpt-6-luna",
  reportDefaultModels: 10,
  // Rate-limit errors retry with backoff and failed cells resume on the next
  // run, so this can be raised safely; override per-run with --concurrency.
  concurrencyPerProvider: 6,
  maxAttempts: 3,
};
