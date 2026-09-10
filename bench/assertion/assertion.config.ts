import type { ImageDetailLevel, ReasoningEffortLevel } from "../../src/constants.js";
import { benchConfig } from "../bench.config.js";

export interface AssertionBenchConfig {
  /**
   * Default dataset: a directory name under `bench/datasets/`, or a path to a
   * dataset directory anywhere on disk. Override per run with `--dataset`.
   *
   * Deliberately separate from `benchConfig.dataset` (and from the
   * `BENCH_DATASET` env var): a visibility dataset needs
   * `visibility_per_file.md`, which a screenshot dataset does not have, so
   * inheriting that default would resolve to a directory without it.
   */
  readonly dataset: string;
  /** Models under test when `--models` is omitted. Shared with the discovery bench. */
  readonly models: readonly string[];
  /** Repeat runs per model x image, for consistency measurement. */
  readonly repeats: number;
  readonly reasoningEffort: ReasoningEffortLevel;
  readonly imageFidelity: ImageDetailLevel;
  readonly maxTokens: number;
  readonly concurrencyPerProvider: number;
  readonly maxAttempts: number;
}

/**
 * Everything except the dataset mirrors the discovery bench, so the two
 * harnesses stay comparable: same roster, same repeat count, same effort and
 * fidelity defaults, same retry and concurrency behaviour.
 */
export const assertionBenchConfig: AssertionBenchConfig = {
  dataset: "visibility-golden",
  models: benchConfig.models,
  repeats: benchConfig.repeats,
  reasoningEffort: benchConfig.reasoningEffort,
  imageFidelity: benchConfig.imageFidelity,
  maxTokens: benchConfig.maxTokens,
  concurrencyPerProvider: benchConfig.concurrencyPerProvider,
  maxAttempts: benchConfig.maxAttempts,
};
