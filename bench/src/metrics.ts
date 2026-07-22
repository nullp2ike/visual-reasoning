import type { Manifest, ModelMetrics, ResolvedCell } from "./types.js";
import { mean, median, percentile } from "./util.js";

/**
 * Compute per-model metrics from resolved cells. Detection rates are defined per
 * expected issue over that image's ok reps, so a failed rep shrinks the denominator
 * instead of counting as a miss.
 */
export function computeModelMetrics(
  model: string,
  provider: string,
  cells: readonly ResolvedCell[],
  manifest: Manifest,
): ModelMetrics {
  const modelCells = cells.filter((c) => c.model === model);
  const okCells = modelCells.filter((c) => c.status === "ok");
  const failedRuns = modelCells.length - okCells.length;

  // Per expected issue (imageId + expectedIndex): detection rate across ok reps.
  const detectionRates: number[] = [];
  for (const entry of manifest.entries) {
    const imageCells = okCells.filter((c) => c.imageId === entry.imageId);
    for (let i = 0; i < entry.expectedIssues.length; i++) {
      if (imageCells.length === 0) continue;
      const foundCount = imageCells.filter((c) =>
        c.expected.some((e) => e.expectedIndex === i && e.found),
      ).length;
      detectionRates.push(foundCount / imageCells.length);
    }
  }

  const noBugsIds = manifest.entries
    .filter((e) => e.expectedIssues.length === 0)
    .map((e) => e.imageId);
  const noBugsCells = okCells.filter((c) => noBugsIds.includes(c.imageId));
  const cleanCount = noBugsCells.filter((c) => c.reportedIssues.length === 0).length;

  const durations = okCells
    .map((c) => c.usage?.durationSeconds)
    .filter((d): d is number => d !== undefined);
  const costs = okCells
    .map((c) => c.usage?.estimatedCost)
    .filter((c): c is number => c !== undefined);

  return {
    model,
    provider,
    okRuns: okCells.length,
    failedRuns,
    meanRecall: mean(detectionRates),
    anyRecall:
      detectionRates.length === 0
        ? null
        : detectionRates.filter((p) => p > 0).length / detectionRates.length,
    flakiness:
      detectionRates.length === 0
        ? null
        : detectionRates.filter((p) => p > 0 && p < 1).length / detectionRates.length,
    extrasPerRun: mean(okCells.map((c) => c.extraReportedIndexes.length)),
    noBugsCleanRate: noBugsCells.length === 0 ? null : cleanCount / noBugsCells.length,
    latencyMedianSeconds: median(durations),
    latencyP95Seconds: percentile(durations, 95),
    meanCostPerRun: mean(costs),
    totalCost: costs.length === 0 ? null : costs.reduce((sum, c) => sum + c, 0),
    meanInputTokens: mean(
      okCells.map((c) => c.usage?.inputTokens).filter((t): t is number => t !== undefined),
    ),
    meanOutputTokens: mean(
      okCells.map((c) => c.usage?.outputTokens).filter((t): t is number => t !== undefined),
    ),
    meanReasoningTokens: mean(
      okCells.map((c) => c.usage?.reasoningTokens).filter((t): t is number => t !== undefined),
    ),
  };
}

/** Leaderboard order: meanRecall desc, then extrasPerRun asc, then model name. */
export function sortLeaderboard(models: readonly ModelMetrics[]): ModelMetrics[] {
  return [...models].sort((a, b) => {
    const recallA = a.meanRecall ?? -1;
    const recallB = b.meanRecall ?? -1;
    if (recallA !== recallB) return recallB - recallA;
    const extrasA = a.extrasPerRun ?? Number.POSITIVE_INFINITY;
    const extrasB = b.extrasPerRun ?? Number.POSITIVE_INFINITY;
    if (extrasA !== extrasB) return extrasA - extrasB;
    return a.model.localeCompare(b.model);
  });
}
