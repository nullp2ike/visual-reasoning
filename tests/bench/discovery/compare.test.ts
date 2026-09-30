import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  buildComparisonHtml,
  buildComparisonMarkdown,
  buildJudgeComparison,
  disagreementHeat,
  outvotedByRep,
} from "../../../bench/discovery/src/compare.js";
import type { Manifest, ResolvedCell, Scores } from "../../../bench/discovery/src/types.js";

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
    series: "model-a",
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
        series: "model-a",
        model: "model-a",
        provider: "anthropic",
        reasoningEffort: "medium",
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
        cacheHitRate: null,
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

describe("buildComparisonHtml", () => {
  const comparison = buildJudgeComparison(
    [scores("judge-a", [cell(true)], 1.0), scores("judge-b", [cell(false)], 0.5)],
    manifest,
  );

  it("renders a standalone page with the metric table and disagreement reasonings", () => {
    const html = buildComparisonHtml(comparison, { backHref: "index.html" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>judge-a recall</th>");
    expect(html).toContain("model-a");
    expect(html).toContain("typo.png");
    expect(html).toContain('Disagreements (<span id="d-count">1</span>)');
    expect(html).toContain('<a href="index.html">');
  });

  it("escapes model output so it can never inject markup", () => {
    const hostile = buildJudgeComparison(
      [
        scores("judge-a", [{ ...cell(true), series: "<b>x</b>", model: "<b>x</b>" }], 1.0),
        scores("judge-b", [{ ...cell(false), series: "<b>x</b>", model: "<b>x</b>" }], 0.5),
      ],
      manifest,
    );
    const html = buildComparisonHtml(hostile, { backHref: "index.html" });
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("disagreement heat", () => {
  // Five judges over two reps of one cell: rep 1 splits 3-2, rep 2 splits 4-1.
  const verdicts: [string, boolean, boolean][] = [
    ["j1", true, true],
    ["j2", true, true],
    ["j3", true, true],
    ["j4", false, true],
    ["j5", false, false],
  ];
  const comparison = buildJudgeComparison(
    verdicts.map(([judge, rep1, rep2]) =>
      scores(judge, [cell(rep1, { rep: 1 }), cell(rep2, { rep: 2 })], 0.5),
    ),
    manifest,
  );

  it("counts the outvoted verdicts in each rep", () => {
    const [d] = comparison.disagreements;
    expect(d).toBeDefined();
    expect(outvotedByRep(d!)).toEqual(
      new Map([
        [1, 2],
        [2, 1],
      ]),
    );
  });

  it("sums them per screenshot and model, with the number of split reps", () => {
    expect(disagreementHeat(comparison).get("model-a img_01")).toEqual({
      series: "model-a",
      imageId: "img_01",
      splitReps: 2,
      outvoted: 3,
    });
  });

  it("keeps the reported issues of each rep for the detail view", () => {
    const withIssue = buildJudgeComparison(
      verdicts
        .slice(0, 2)
        .map(([judge, rep1]) =>
          scores(
            judge,
            [
              cell(rep1, {
                reportedIssues: [
                  {
                    priority: "major",
                    category: "content",
                    description: "Title typo",
                    suggestion: "",
                  },
                ],
              }),
            ],
            0.5,
          ),
        )
        .concat([scores("j9", [cell(false)], 0.5)]),
      manifest,
    );
    expect(withIssue.disagreements[0]?.reportedByRep).toEqual({ "1": ["Title typo"] });
  });

  it("renders a heatmap whose cells link to their disagreement, shaded by outvoted verdicts", () => {
    const html = buildComparisonHtml(comparison, { backHref: "report.html", imageBase: "shots" });
    expect(html).toContain('<table id="heatmap">');
    expect(html).toMatch(/<td class="heat"[^>]*data-outvoted="3"[^>]*><a href="#d-0-img_01"/);
    expect(html).toContain("2 of 2 reps split, 3 outvoted verdicts");
    expect(html).toContain('id="d-0-img_01"');
    expect(html).toContain('<img src="shots/typo.png"');
  });
});

describe("buildComparisonHtml model filter", () => {
  const comparison = buildJudgeComparison(
    [scores("judge-a", [cell(true)], 1.0), scores("judge-b", [cell(false)], 0.5)],
    manifest,
  );
  const html = buildComparisonHtml(comparison, {
    backHref: "report.html",
    defaultSeries: { series: ["model-a"], rankJudge: "judge-a" },
  });

  it("offers the shared model filter, ranked and labelled by the ranking judge", () => {
    expect(html).toContain('<details id="model-filter"');
    expect(html).toContain('"defaults":["model-a"]');
    expect(html).toContain('"defaultJudge":"judge-a"');
    expect(html).toContain('"labels":{"model-a":"100%"}');
  });

  it("tags every heatmap column, metric row and disagreement with its model", () => {
    expect(html).toContain('<th class="col" data-model="model-a">');
    expect(html).toMatch(/<td class="heat" data-model="model-a" data-outvoted="1"/);
    expect(html).toContain('<tr data-model="model-a">');
    expect(html).toContain('<section class="disagreement" data-model="model-a"');
  });

  it("emits a syntactically valid inline script", () => {
    const match = /<script>\n([\s\S]*?)<\/script>/.exec(html);
    expect(match).not.toBeNull();
    expect(() => new Script(match?.[1] ?? "")).not.toThrow();
  });
});
