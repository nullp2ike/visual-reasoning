import type { ReasoningEffortLevel } from "../src/constants.js";

/**
 * The frozen prompt fed to every model under test via `ask()`.
 * Changing it invalidates all committed runs (records carry its sha256).
 */
export const BENCH_PROMPT = "What looks visually broken on this page?";

export interface BenchConfig {
  /** Models under test. Provider is inferred from the model name by the library. */
  readonly models: readonly string[];
  /** Repeat runs per model x image, for consistency measurement. */
  readonly repeats: number;
  /** Fixed reasoning effort applied to every model under test. */
  readonly reasoningEffort: ReasoningEffortLevel;
  /** Text-only judge that matches reported issues against expected issues. */
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
    // Anthropic: flagship / mid / small (claude-fable-5 currently excluded from the
    // roster; its partial run records remain in results/runs/ and are ignored by scoring)
    "claude-opus-4-8",
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
  judgeModel: "claude-haiku-4-5",
  concurrencyPerProvider: 2,
  maxAttempts: 3,
};
