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
  /** Concurrent in-flight requests per provider during a sweep. */
  readonly concurrencyPerProvider: number;
  /** Max attempts per run cell (1 initial + retries) on transient provider errors. */
  readonly maxAttempts: number;
}

export const benchConfig: BenchConfig = {
  models: [
    // Anthropic: mid / small (claude-fable-5 currently excluded from the roster;
    // its partial run records remain in results/runs/ and are ignored by scoring)
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    // OpenAI: flagship / mini
    "gpt-5.5",
    "gpt-5.4-mini",
    // Google: pro / flash / flash-lite
    "gemini-3.1-pro-preview",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
  ],
  repeats: 5,
  reasoningEffort: "medium",
  judgeModel: "claude-haiku-4-5",
  concurrencyPerProvider: 2,
  maxAttempts: 3,
};
