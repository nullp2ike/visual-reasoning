import { describe, expect, it } from "vitest";
import { buildStatementPivot } from "../../../bench/visibility/src/pivot.js";
import type {
  GradedCell,
  VisibilityImage,
  VisibilityModelMetrics,
  VisibilityScores,
} from "../../../bench/visibility/src/types.js";

function image(filename: string): VisibilityImage {
  return {
    filename,
    sha256: "h",
    visibleCall: ["Title"],
    hiddenCall: ["Gear icon"],
    elements: ["Gear icon", "Title"],
    expectedVisible: ["Title"],
    promptHash: "p",
  };
}

function metrics(series: string): VisibilityModelMetrics {
  return {
    series,
    model: series,
    provider: "google",
    reasoningEffort: "medium",
    imageFidelity: "auto",
    okRuns: 0,
    failedRuns: 0,
    invalidRuns: 0,
    accuracy: null,
    presentRecall: null,
    absentAccuracy: null,
    visiblePromptAccuracy: null,
    hiddenPromptAccuracy: null,
    allCorrectRate: null,
    flakiness: null,
    textMismatches: 0,
    latencyMedianSeconds: null,
    latencyP95Seconds: null,
    meanCostPerRun: null,
    totalCost: null,
    meanInputTokens: null,
    meanOutputTokens: null,
    meanReasoningTokens: null,
  };
}

/** One rep: `title` and `gear` are whether each element was answered correctly. */
function cell(
  series: string,
  filename: string,
  rep: number,
  title: boolean,
  gear: boolean,
  status: GradedCell["status"] = "ok",
): GradedCell {
  return {
    series,
    model: series,
    provider: "google",
    reasoningEffort: "medium",
    imageFidelity: "auto",
    filename,
    rep,
    status,
    elements:
      status === "ok"
        ? [
            {
              element: "Title",
              askedAs: "visible",
              expectedVisible: true,
              answeredVisible: title,
              correct: title,
              reasoning: "",
              textMismatch: false,
            },
            {
              element: "Gear icon",
              askedAs: "hidden",
              expectedVisible: false,
              answeredVisible: !gear,
              correct: gear,
              reasoning: "",
              textMismatch: false,
            },
          ]
        : [],
    allCorrect: status === "ok" ? title && gear : null,
  };
}

function scores(cells: GradedCell[], series = ["model-a", "model-b"]): VisibilityScores {
  return {
    schemaVersion: 2,
    generatedAt: "2026-09-09T00:00:00.000Z",
    dataset: "d",
    images: [image("a.png"), image("b.png")],
    models: series.map(metrics),
    cells,
    staleRecords: 0,
  };
}

describe("buildStatementPivot", () => {
  it("counts files with any wrong rep, not wrong reps", () => {
    const rows = buildStatementPivot(
      scores([
        // Title wrong in 2 of 3 reps on a.png: that is ONE failing file.
        cell("model-a", "a.png", 1, false, true),
        cell("model-a", "a.png", 2, false, true),
        cell("model-a", "a.png", 3, true, true),
        cell("model-a", "b.png", 1, true, true),
      ]),
    );
    const title = rows.find((r) => r.statement === "Title");
    expect(title?.cells["model-a"]).toMatchObject({ failingFiles: 1, files: 2 });
    expect(title?.cells["model-a"]?.failing).toEqual([{ filename: "a.png", correct: 1, total: 3 }]);
  });

  it("keeps a column for a series that never graded the statement", () => {
    const rows = buildStatementPivot(scores([cell("model-a", "a.png", 1, true, true)]));
    const title = rows.find((r) => r.statement === "Title");
    expect(title?.cells["model-b"]).toEqual({ failingFiles: 0, files: 0, failing: [] });
  });

  it("ignores failed and invalid reps", () => {
    const rows = buildStatementPivot(
      scores([
        cell("model-a", "a.png", 1, true, true),
        cell("model-a", "a.png", 2, false, false, "error"),
        cell("model-a", "b.png", 1, true, true, "invalid"),
      ]),
    );
    const title = rows.find((r) => r.statement === "Title");
    expect(title?.cells["model-a"]).toMatchObject({ failingFiles: 0, files: 1 });
  });

  it("records which prompt asked each statement", () => {
    const rows = buildStatementPivot(scores([cell("model-a", "a.png", 1, true, true)]));
    expect(rows.find((r) => r.statement === "Title")?.askedAs).toEqual(["visible"]);
    expect(rows.find((r) => r.statement === "Gear icon")?.askedAs).toEqual(["hidden"]);
  });

  it("sorts the worst wording first, by its worst model", () => {
    const rows = buildStatementPivot(
      scores([
        // Gear icon fails on both files for model-b; Title fails on one file for model-a.
        cell("model-a", "a.png", 1, false, true),
        cell("model-a", "b.png", 1, true, true),
        cell("model-b", "a.png", 1, true, false),
        cell("model-b", "b.png", 1, true, false),
      ]),
    );
    expect(rows.map((r) => r.statement)).toEqual(["Gear icon", "Title"]);
    expect(rows[0]?.maxFailing).toBe(2);
    expect(rows[1]?.maxFailing).toBe(1);
  });

  it("orders failing files worst first inside a cell", () => {
    const rows = buildStatementPivot(
      scores([
        cell("model-a", "a.png", 1, false, true),
        cell("model-a", "a.png", 2, true, true), // a.png: 1/2
        cell("model-a", "b.png", 1, false, true), // b.png: 0/1
      ]),
    );
    const failing = rows.find((r) => r.statement === "Title")?.cells["model-a"]?.failing;
    expect(failing?.map((f) => f.filename)).toEqual(["b.png", "a.png"]);
  });

  it("returns no rows when nothing was graded", () => {
    expect(buildStatementPivot(scores([]))).toEqual([]);
  });
});
