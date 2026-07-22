import { describe, expect, it } from "vitest";
import { computeModelMetrics, sortLeaderboard } from "../../bench/src/metrics.js";
import type { Manifest, ModelMetrics, ResolvedCell } from "../../bench/src/types.js";
import { mean, median, percentile } from "../../bench/src/util.js";

const manifest: Manifest = {
  schemaVersion: 1,
  promptHash: "hash",
  generatedAt: "2026-07-22T00:00:00.000Z",
  entries: [
    {
      imageId: "img_01",
      filename: "bug_a.png",
      sha256: "s1",
      expectedIssues: ["issue A1", "issue A2"],
    },
    { imageId: "img_02", filename: "no_bugs.png", sha256: "s2", expectedIssues: [] },
  ],
};

function makeCell(
  partial: Partial<ResolvedCell> & Pick<ResolvedCell, "imageId" | "rep">,
): ResolvedCell {
  return {
    model: "model-x",
    status: "ok",
    reportedIssues: [],
    expected: [],
    extraReportedIndexes: [],
    overridden: false,
    ...partial,
  };
}

function expectedEntry(index: number, found: boolean) {
  return {
    expectedIndex: index,
    found,
    matchedReportedIndexes: [],
    reasoning: "r",
    overridden: false,
  };
}

describe("computeModelMetrics", () => {
  it("computes recall, flakiness, extras, and no-bugs cleanliness", () => {
    const issue = {
      priority: "minor",
      category: "other",
      description: "d",
      suggestion: "s",
    } as const;
    const cells: ResolvedCell[] = [
      // img_01: issue 0 found in both reps (p=1), issue 1 found in one rep (p=0.5)
      makeCell({
        imageId: "img_01",
        rep: 1,
        expected: [expectedEntry(0, true), expectedEntry(1, true)],
      }),
      makeCell({
        imageId: "img_01",
        rep: 2,
        expected: [expectedEntry(0, true), expectedEntry(1, false)],
        reportedIssues: [issue],
        extraReportedIndexes: [0],
        usage: { inputTokens: 100, outputTokens: 50, estimatedCost: 0.01, durationSeconds: 2 },
      }),
      // img_02 (no bugs): one clean rep, one rep with a false positive
      makeCell({ imageId: "img_02", rep: 1 }),
      makeCell({ imageId: "img_02", rep: 2, reportedIssues: [issue], extraReportedIndexes: [0] }),
    ];

    const metrics = computeModelMetrics("model-x", "anthropic", cells, manifest);
    expect(metrics.okRuns).toBe(4);
    expect(metrics.failedRuns).toBe(0);
    expect(metrics.meanRecall).toBeCloseTo((1 + 0.5) / 2);
    expect(metrics.anyRecall).toBe(1);
    expect(metrics.flakiness).toBeCloseTo(0.5); // one of two issues has 0 < p < 1
    expect(metrics.extrasPerRun).toBeCloseTo(2 / 4);
    expect(metrics.noBugsCleanRate).toBeCloseTo(0.5);
    expect(metrics.latencyMedianSeconds).toBe(2);
    expect(metrics.meanCostPerRun).toBeCloseTo(0.01);
    expect(metrics.totalCost).toBeCloseTo(0.01);
  });

  it("excludes failed reps from detection denominators and counts them", () => {
    const cells: ResolvedCell[] = [
      makeCell({
        imageId: "img_01",
        rep: 1,
        expected: [expectedEntry(0, true), expectedEntry(1, false)],
      }),
      makeCell({
        imageId: "img_01",
        rep: 2,
        status: "error",
        error: { name: "E", message: "boom" },
      }),
    ];
    const metrics = computeModelMetrics("model-x", "anthropic", cells, manifest);
    expect(metrics.failedRuns).toBe(1);
    expect(metrics.okRuns).toBe(1);
    // Denominator is the single ok rep: p = 1 and p = 0
    expect(metrics.meanRecall).toBeCloseTo(0.5);
    expect(metrics.flakiness).toBe(0);
  });

  it("returns nulls when a model has no successful runs", () => {
    const cells: ResolvedCell[] = [
      makeCell({
        imageId: "img_01",
        rep: 1,
        status: "error",
        error: { name: "E", message: "boom" },
      }),
    ];
    const metrics = computeModelMetrics("model-x", "anthropic", cells, manifest);
    expect(metrics.meanRecall).toBeNull();
    expect(metrics.extrasPerRun).toBeNull();
    expect(metrics.noBugsCleanRate).toBeNull();
    expect(metrics.latencyMedianSeconds).toBeNull();
  });

  it("ignores cells from other models", () => {
    const cells: ResolvedCell[] = [
      makeCell({
        imageId: "img_01",
        rep: 1,
        expected: [expectedEntry(0, true), expectedEntry(1, true)],
      }),
      makeCell({
        model: "other-model",
        imageId: "img_01",
        rep: 1,
        expected: [expectedEntry(0, false), expectedEntry(1, false)],
      }),
    ];
    const metrics = computeModelMetrics("model-x", "anthropic", cells, manifest);
    expect(metrics.meanRecall).toBe(1);
  });
});

describe("sortLeaderboard", () => {
  function metricsWith(
    model: string,
    meanRecall: number | null,
    extrasPerRun: number | null,
  ): ModelMetrics {
    return {
      model,
      provider: "anthropic",
      okRuns: 1,
      failedRuns: 0,
      meanRecall,
      anyRecall: null,
      flakiness: null,
      extrasPerRun,
      noBugsCleanRate: null,
      latencyMedianSeconds: null,
      latencyP95Seconds: null,
      meanCostPerRun: null,
      totalCost: null,
      meanInputTokens: null,
      meanOutputTokens: null,
      meanReasoningTokens: null,
    };
  }

  it("sorts by recall desc, extras asc, then name", () => {
    const sorted = sortLeaderboard([
      metricsWith("c", 0.5, 1),
      metricsWith("a", 0.9, 3),
      metricsWith("b", 0.9, 1),
      metricsWith("d", null, null),
    ]);
    expect(sorted.map((m) => m.model)).toEqual(["b", "a", "c", "d"]);
  });
});

describe("stats helpers", () => {
  it("median handles odd, even, and empty inputs", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("percentile picks the ceiling rank", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
    expect(percentile([], 95)).toBeNull();
  });

  it("mean handles empty input", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([])).toBeNull();
  });
});
