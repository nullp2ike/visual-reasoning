import { describe, expect, it } from "vitest";
import { buildComparisonMarkdown, buildJudgeComparison } from "../../bench/src/compare.js";
import type { Manifest, ResolvedCell, Scores } from "../../bench/src/types.js";

const manifest: Manifest = {
  schemaVersion: 1,
  promptHash: "hash",
  generatedAt: "2026-07-23T00:00:00.000Z",
  entries: [{ imageId: "img_01", filename: "typo.png", sha256: "s1", expectedIssues: ["A typo"] }],
  retired: [],
};

function cell(found: boolean, overrides: Partial<ResolvedCell> = {}): ResolvedCell {
  return {
    model: "model-a",
    imageId: "img_01",
    rep: 1,
    status: "ok",
    reportedIssues: [],
    expected: [
      {
        expectedIndex: 0,
        found,
        matchedReportedIndexes: found ? [0] : [],
        reasoning: found ? "matched" : "missed",
        overridden: false,
      },
    ],
    extraReportedIndexes: [],
    overridden: false,
    ...overrides,
  };
}

function scores(judgeModel: string, cells: ResolvedCell[], meanRecall: number): Scores {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-23T00:00:00.000Z",
    prompt: "What looks broken?",
    promptHash: "hash",
    reasoningEffort: "medium",
    repeats: 2,
    judgeModel,
    judgePromptVersion: "v1",
    overrideCount: 0,
    models: [
      {
        model: "model-a",
        provider: "anthropic",
        okRuns: cells.length,
        failedRuns: 0,
        meanRecall,
        anyRecall: null,
        flakiness: null,
        extrasPerRun: 1.5,
        noBugsCleanRate: null,
        latencyMedianSeconds: null,
        latencyP95Seconds: null,
        meanCostPerRun: null,
        totalCost: null,
        meanInputTokens: null,
        meanOutputTokens: null,
        meanReasoningTokens: null,
      },
    ],
    cells,
  };
}

describe("buildJudgeComparison", () => {
  it("computes per-model metric deltas between judges", () => {
    const comparison = buildJudgeComparison(
      [scores("judge-a", [cell(true)], 1.0), scores("judge-b", [cell(false)], 0.5)],
      manifest,
    );
    expect(comparison.judges).toEqual(["judge-a", "judge-b"]);
    const model = comparison.perModel[0]!;
    expect(model.model).toBe("model-a");
    expect(model.byJudge["judge-a"]?.meanRecall).toBe(1.0);
    expect(model.byJudge["judge-b"]?.meanRecall).toBe(0.5);
    expect(model.recallDelta).toBeCloseTo(0.5, 10);
  });

  it("extracts disagreements where per-rep found verdicts differ", () => {
    const comparison = buildJudgeComparison(
      [
        scores("judge-a", [cell(true), cell(true, { rep: 2 })], 1.0),
        scores("judge-b", [cell(true), cell(false, { rep: 2 })], 0.5),
      ],
      manifest,
    );
    expect(comparison.disagreements).toHaveLength(1);
    const d = comparison.disagreements[0]!;
    expect(d.model).toBe("model-a");
    expect(d.imageId).toBe("img_01");
    expect(d.expectedIndex).toBe(0);
    expect(d.perJudge["judge-a"]?.map((r) => r.found)).toEqual([true, true]);
    expect(d.perJudge["judge-b"]?.map((r) => r.found)).toEqual([true, false]);
  });

  it("reports no disagreements when judges agree", () => {
    const comparison = buildJudgeComparison(
      [scores("judge-a", [cell(true)], 1.0), scores("judge-b", [cell(true)], 1.0)],
      manifest,
    );
    expect(comparison.disagreements).toHaveLength(0);
  });

  it("excludes overridden cells from disagreements but counts them", () => {
    const overriddenCell = cell(true, {
      overridden: true,
      expected: [
        {
          expectedIndex: 0,
          found: true,
          matchedReportedIndexes: [],
          reasoning: "Manually overridden.",
          overridden: true,
        },
      ],
    });
    const comparison = buildJudgeComparison(
      [scores("judge-a", [overriddenCell], 1.0), scores("judge-b", [cell(false)], 0.0)],
      manifest,
    );
    expect(comparison.disagreements).toHaveLength(0);
    expect(comparison.overriddenExcluded).toBe(1);
  });

  it("throws when given fewer than two judges", () => {
    expect(() => buildJudgeComparison([scores("judge-a", [cell(true)], 1)], manifest)).toThrow(
      /at least two/i,
    );
  });
});

describe("buildComparisonMarkdown", () => {
  it("renders judges, deltas, and disagreement reasonings", () => {
    const md = buildComparisonMarkdown(
      buildJudgeComparison(
        [scores("judge-a", [cell(true)], 1.0), scores("judge-b", [cell(false)], 0.5)],
        manifest,
      ),
    );
    expect(md).toContain("judge-a");
    expect(md).toContain("judge-b");
    expect(md).toContain("model-a");
    expect(md).toContain("typo.png");
    expect(md).toContain("matched");
    expect(md).toContain("missed");
  });
});
