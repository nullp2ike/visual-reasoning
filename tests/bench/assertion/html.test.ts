import { describe, expect, it } from "vitest";
import { buildVisibilityReportHtml } from "../../../bench/assertion/src/html.js";
import { imageBaseForReport } from "../../../bench/assertion/src/report.js";
import type { VisibilityScores } from "../../../bench/assertion/src/types.js";

function scores(partial: Partial<VisibilityScores> = {}): VisibilityScores {
  return {
    schemaVersion: 2,
    generatedAt: "2026-09-09T12:00:00.000Z",
    dataset: "visibility-golden",
    images: [
      {
        filename: "a.png",
        sha256: "h",
        visibleCall: ["Title"],
        hiddenCall: ["Gear icon"],
        elements: ["Gear icon", "Title"],
        expectedVisible: ["Title"],
        promptHash: "p",
      },
    ],
    models: [
      {
        series: "model-a",
        model: "model-a",
        provider: "google",
        reasoningEffort: "medium",
        imageFidelity: "auto",
        okRuns: 2,
        failedRuns: 0,
        invalidRuns: 0,
        accuracy: 0.75,
        presentRecall: 0.5,
        absentAccuracy: 1,
        visiblePromptAccuracy: 0.5,
        hiddenPromptAccuracy: 1,
        allCorrectRate: 0.5,
        flakiness: 0.5,
        textMismatches: 0,
        latencyMedianSeconds: 2,
        latencyP95Seconds: 3,
        meanCostPerRun: 0.001,
        totalCost: 0.002,
        meanInputTokens: 10,
        meanOutputTokens: 5,
        meanReasoningTokens: null,
      },
    ],
    cells: [1, 2].map((rep) => ({
      series: "model-a",
      model: "model-a",
      provider: "google",
      reasoningEffort: "medium",
      imageFidelity: "auto",
      filename: "a.png",
      rep,
      status: "ok" as const,
      // Title is answered correctly in rep 1 only, so it is the inconsistent row.
      elements: [
        {
          element: "Title",
          askedAs: "visible" as const,
          expectedVisible: true,
          answeredVisible: rep === 1,
          correct: rep === 1,
          reasoning: `rep ${rep} saw the title`,
          textMismatch: false,
        },
        {
          element: "Gear icon",
          askedAs: "hidden" as const,
          expectedVisible: false,
          answeredVisible: false,
          correct: true,
          reasoning: "no gear",
          textMismatch: false,
        },
      ],
      allCorrect: rep === 1,
    })),
    staleRecords: 0,
    ...partial,
  };
}

describe("buildVisibilityReportHtml", () => {
  it("produces a standalone document with no external resources", () => {
    const html = buildVisibilityReportHtml(scores(), "../../datasets/visibility-golden");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+stylesheet/);
  });

  it("inlines the scores as parseable JSON", () => {
    const html = buildVisibilityReportHtml(scores(), ".");
    const match = /<script id="data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match?.[1] ?? "") as { scores: VisibilityScores };
    expect(parsed.scores.cells).toHaveLength(2);
    expect(parsed.scores.images[0]?.filename).toBe("a.png");
  });

  it("escapes a closing script tag so the data block cannot break out", () => {
    const withTag = scores();
    const first = withTag.cells[0]?.elements[0];
    if (first) first.reasoning = "</script><img onerror=alert(1)>";
    const html = buildVisibilityReportHtml(withTag, ".");
    const block = /<script id="data"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    expect(block).not.toContain("</script>");
    expect(block).toContain("\\u003c/script>");
  });

  it("carries the three consistency filters and the drill-down grid", () => {
    const html = buildVisibilityReportHtml(scores(), ".");
    expect(html).toContain('id="f-dis"');
    expect(html).toContain('id="f-mix"');
    expect(html).toContain('id="f-hid"');
    expect(html).toContain('id="grid"');
    expect(html).toContain('id="matrix"');
    expect(html).toContain('id="leaderboard"');
  });

  it("inlines the per-statement pivot and renders its section", () => {
    const html = buildVisibilityReportHtml(scores(), ".");
    expect(html).toContain('id="pivot"');
    expect(html).toContain("Per-statement pivot");
    const parsed = JSON.parse(
      /<script id="data"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "",
    ) as { pivot: { statement: string; cells: Record<string, { failingFiles: number }> }[] };
    expect(parsed.pivot.map((r) => r.statement).sort()).toEqual(["Gear icon", "Title"]);
    // Title is wrong in rep 2, so its one file counts as failing.
    expect(parsed.pivot.find((r) => r.statement === "Title")?.cells["model-a"]?.failingFiles).toBe(
      1,
    );
  });

  it("states the dataset, image count and model count", () => {
    const html = buildVisibilityReportHtml(scores(), ".");
    expect(html).toContain("visibility-golden");
    expect(html).toContain("1 image(s)");
    expect(html).toContain("1 model(s)");
  });

  it("notes stale records only when there are some", () => {
    expect(buildVisibilityReportHtml(scores(), ".")).not.toContain("stale record");
    expect(buildVisibilityReportHtml(scores({ staleRecords: 3 }), ".")).toContain(
      "<b>3 stale record(s) ignored.</b>",
    );
  });

  it("escapes HTML in the title so a dataset name cannot inject markup", () => {
    const html = buildVisibilityReportHtml(scores({ dataset: "<img src=x onerror=1>" }), ".");
    expect(html).toContain("&lt;img src=x onerror=1&gt;");
    expect(html).not.toContain("<img src=x onerror=1>");
  });

  it("links screenshots through the supplied relative base", () => {
    const html = buildVisibilityReportHtml(scores(), "../../datasets/visibility-golden/");
    const parsed = JSON.parse(
      /<script id="data"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "",
    ) as { imageBase: string };
    // Trailing slash trimmed, since the page joins with "/" itself.
    expect(parsed.imageBase).toBe("../../datasets/visibility-golden");
  });
});

describe("imageBaseForReport", () => {
  it("walks from the results directory back to the dataset", () => {
    expect(
      imageBaseForReport(
        "/repo/bench/results/visibility-golden/visibility",
        "/repo/bench/datasets/visibility-golden",
      ),
    ).toBe("../../../datasets/visibility-golden");
  });

  it("handles a dataset that lives outside the repo", () => {
    const base = imageBaseForReport("/repo/bench/results/shots/visibility", "/elsewhere/shots");
    expect(base.startsWith("../")).toBe(true);
    expect(base.endsWith("shots")).toBe(true);
  });

  it("returns a dot when both paths are the same", () => {
    expect(imageBaseForReport("/a/b", "/a/b")).toBe(".");
  });
});
