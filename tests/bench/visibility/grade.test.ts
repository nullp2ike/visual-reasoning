import { describe, expect, it } from "vitest";
import {
  buildVisibilityScores,
  computeVisibilityMetrics,
  gradeRecord,
  renderingSeries,
  sortVisibilityLeaderboard,
} from "../../../bench/visibility/src/grade.js";
import {
  VisibilityModelMetricsSchema,
  VisibilityScoresSchema,
  type GradedCell,
  type VisibilityCall,
  type VisibilityImage,
  type VisibilityModelMetrics,
  type VisibilityRunRecord,
} from "../../../bench/visibility/src/types.js";

/**
 * Two elements per prompt mode, and each mode carries one element that
 * contradicts its section — so neither call has a uniform expected answer.
 *
 *   visible call: Title (visible), Chewing gum logo (| FALSE -> absent)
 *   hidden call:  Gear icon (absent), Search bar (| FALSE -> visible)
 */
const image: VisibilityImage = {
  filename: "a.png",
  sha256: "img-hash",
  visibleCall: ["Chewing gum logo", "Title"],
  hiddenCall: ["Gear icon", "Search bar"],
  elements: ["Chewing gum logo", "Gear icon", "Search bar", "Title"],
  expectedVisible: ["Title", "Search bar"],
  promptHash: "prompt-hash",
};

function statements(elements: readonly string[], passes: readonly boolean[], mode: string) {
  return elements.map((element, i) => ({
    statement:
      mode === "visible"
        ? `The element "${element}" is fully visible on the page`
        : `The element "${element}" is NOT visible on the page`,
    pass: passes[i] ?? false,
    reasoning: "because",
  }));
}

/**
 * `visiblePasses` are answers to "is it fully visible?" for the visible call,
 * `hiddenPasses` answers to "is it NOT visible?" for the hidden call, each in
 * the call's own element order.
 */
function makeRecord(
  visiblePasses: boolean[],
  hiddenPasses: boolean[],
  partial: Partial<VisibilityRunRecord> = {},
): VisibilityRunRecord {
  const calls: VisibilityCall[] = [
    {
      mode: "visible",
      elements: image.visibleCall,
      status: "ok",
      result: {
        pass: visiblePasses.every(Boolean),
        reasoning: "r",
        statements: statements(image.visibleCall, visiblePasses, "visible"),
      },
    },
    {
      mode: "hidden",
      elements: image.hiddenCall,
      status: "ok",
      result: {
        pass: hiddenPasses.every(Boolean),
        reasoning: "r",
        statements: statements(image.hiddenCall, hiddenPasses, "hidden"),
      },
    },
  ];
  return {
    schemaVersion: 2,
    model: "model-a",
    provider: "anthropic",
    filename: "a.png",
    imageSha256: "img-hash",
    rep: 1,
    promptHash: "prompt-hash",
    reasoningEffort: "medium",
    imageFidelity: "auto",
    requireCorrectRendering: true,
    maxTokens: 8192,
    timestamp: "2026-09-06T00:00:00.000Z",
    status: "ok",
    calls,
    usage: { inputTokens: 100, outputTokens: 50, estimatedCost: 0.001, durationSeconds: 2 },
    ...partial,
  };
}

/** Chewing gum logo not visible, Title visible; Gear hidden, Search bar not hidden. */
const PERFECT_VISIBLE = [false, true];
const PERFECT_HIDDEN = [true, false];

describe("gradeRecord", () => {
  it("grades both prompt modes against one set of expectations", () => {
    const cell = gradeRecord(makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN), image);
    expect(cell.status).toBe("ok");
    expect(cell.allCorrect).toBe(true);
    expect(cell.elements).toHaveLength(4);
    expect(cell.elements.every((e) => e.correct)).toBe(true);
  });

  it("records which prompt asked about each element", () => {
    const cell = gradeRecord(makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN), image);
    const byElement = new Map(cell.elements.map((e) => [e.element, e.askedAs]));
    expect(byElement.get("Title")).toBe("visible");
    expect(byElement.get("Gear icon")).toBe("hidden");
  });

  it("inverts a hidden-prompt pass into 'not on screen'", () => {
    const cell = gradeRecord(makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN), image);
    // "Gear icon is NOT visible" passed, so the model says it is not on screen.
    const gear = cell.elements.find((e) => e.element === "Gear icon");
    expect(gear).toMatchObject({ answeredVisible: false, expectedVisible: false, correct: true });
    // "Search bar is NOT visible" failed, so the model says it IS on screen.
    const search = cell.elements.find((e) => e.element === "Search bar");
    expect(search).toMatchObject({ answeredVisible: true, expectedVisible: true, correct: true });
  });

  it("counts a hidden-prompt element the model wrongly denies as a miss", () => {
    const cell = gradeRecord(makeRecord(PERFECT_VISIBLE, [true, true]), image);
    const search = cell.elements.find((e) => e.element === "Search bar");
    expect(search).toMatchObject({ answeredVisible: false, expectedVisible: true, correct: false });
    expect(cell.allCorrect).toBe(false);
  });

  it("counts a false statement under the visible prompt as a hallucination when confirmed", () => {
    const cell = gradeRecord(makeRecord([true, true], PERFECT_HIDDEN), image);
    const logo = cell.elements.find((e) => e.element === "Chewing gum logo");
    expect(logo).toMatchObject({ answeredVisible: true, expectedVisible: false, correct: false });
  });

  it("marks the rep invalid when a call returns the wrong number of statements", () => {
    const record = makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN);
    const hidden = record.calls[1];
    if (hidden?.result) hidden.result.statements = hidden.result.statements.slice(0, 1);
    const cell = gradeRecord(record, image);
    expect(cell.status).toBe("invalid");
    expect(cell.invalidReason).toMatch(/hidden call: expected 2 statements, got 1/);
    expect(cell.allCorrect).toBeNull();
  });

  it("fails the whole rep when one of its calls failed", () => {
    const record = makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN, { status: "error" });
    const hidden = record.calls[1];
    if (hidden) {
      hidden.status = "error";
      hidden.result = undefined;
      hidden.error = { name: "VisualAIProviderError", message: "503", attempts: 3 };
    }
    const cell = gradeRecord(record, image);
    expect(cell.status).toBe("error");
    expect(cell.error?.message).toBe("503");
    expect(cell.allCorrect).toBeNull();
  });

  it("tags non-primary effort and fidelity in the series name", () => {
    const cell = gradeRecord(
      makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN, {
        reasoningEffort: "xhigh",
        imageFidelity: "high",
      }),
      image,
    );
    expect(cell.series).toBe("model-a (xhigh, high-res)");
  });

  it("refuses to grade a record against another image's ground truth", () => {
    expect(() =>
      gradeRecord(makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN, { filename: "b.png" }), image),
    ).toThrow(/graded against ground truth/);
  });

  it("grades an image that only uses one prompt mode", () => {
    const visibleOnly: VisibilityImage = {
      ...image,
      hiddenCall: [],
      elements: image.visibleCall,
      expectedVisible: ["Title"],
    };
    const record = makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN);
    record.calls = record.calls.slice(0, 1);
    const cell = gradeRecord(record, visibleOnly);
    expect(cell.status).toBe("ok");
    expect(cell.elements).toHaveLength(2);
    expect(cell.allCorrect).toBe(true);
  });
});

describe("computeVisibilityMetrics", () => {
  function cells(): GradedCell[] {
    return [
      gradeRecord(makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN), image),
      // rep 2: confirms the chewing gum logo, and wrongly denies the search bar.
      gradeRecord(makeRecord([true, true], [true, true], { rep: 2 }), image),
    ];
  }

  it("micro-averages accuracy, present recall and absent accuracy across both modes", () => {
    const metrics = computeVisibilityMetrics("model-a", cells());
    // 8 answers over 2 reps; rep 2 gets 2 of 4 wrong.
    expect(metrics.accuracy).toBeCloseTo(6 / 8);
    // Expected visible: Title, Search bar. Rep 2 misses Search bar.
    expect(metrics.presentRecall).toBeCloseTo(3 / 4);
    // Expected absent: Chewing gum logo, Gear icon. Rep 2 hallucinates the logo.
    expect(metrics.absentAccuracy).toBeCloseTo(3 / 4);
    expect(VisibilityModelMetricsSchema.parse(metrics)).toBeDefined();
  });

  it("splits accuracy by which prompt asked", () => {
    const metrics = computeVisibilityMetrics("model-a", cells());
    expect(metrics.visiblePromptAccuracy).toBeCloseTo(3 / 4);
    expect(metrics.hiddenPromptAccuracy).toBeCloseTo(3 / 4);
  });

  it("reports a mode's accuracy as null when nothing was asked that way", () => {
    const record = makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN);
    record.calls = record.calls.slice(0, 1);
    const visibleOnly: VisibilityImage = {
      ...image,
      hiddenCall: [],
      elements: image.visibleCall,
      expectedVisible: ["Title"],
    };
    const metrics = computeVisibilityMetrics("model-a", [gradeRecord(record, visibleOnly)]);
    expect(metrics.visiblePromptAccuracy).toBeCloseTo(1);
    expect(metrics.hiddenPromptAccuracy).toBeNull();
  });

  it("counts an element answered differently across reps as flaky", () => {
    const metrics = computeVisibilityMetrics("model-a", cells());
    // Chewing gum logo and Search bar flip; Title and Gear icon do not.
    expect(metrics.flakiness).toBeCloseTo(2 / 4);
  });

  it("excludes failed and invalid reps from the rates but counts them", () => {
    const failed = makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN, { rep: 3, status: "error" });
    const failedCall = failed.calls[0];
    if (failedCall) {
      failedCall.status = "error";
      failedCall.result = undefined;
    }
    const invalid = makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN, { rep: 4 });
    const invalidCall = invalid.calls[0];
    if (invalidCall?.result) invalidCall.result.statements = [];

    const metrics = computeVisibilityMetrics("model-a", [
      ...cells(),
      gradeRecord(failed, image),
      gradeRecord(invalid, image),
    ]);
    expect(metrics.okRuns).toBe(2);
    expect(metrics.failedRuns).toBe(1);
    expect(metrics.invalidRuns).toBe(1);
    expect(metrics.accuracy).toBeCloseTo(6 / 8);
  });

  it("reports null rates when no run succeeded", () => {
    const record = makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN, { status: "error" });
    const call = record.calls[0];
    if (call) {
      call.status = "error";
      call.result = undefined;
    }
    const metrics = computeVisibilityMetrics("model-a", [gradeRecord(record, image)]);
    expect(metrics.accuracy).toBeNull();
    expect(metrics.presentRecall).toBeNull();
    expect(metrics.absentAccuracy).toBeNull();
    expect(metrics.allCorrectRate).toBeNull();
    expect(metrics.flakiness).toBeNull();
    expect(metrics.totalCost).toBeNull();
  });

  it("counts text mismatches across runs", () => {
    const record = makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN);
    const first = record.calls[0]?.result?.statements[0];
    if (first) first.statement = "Element 1 is shown";
    const metrics = computeVisibilityMetrics("model-a", [gradeRecord(record, image)]);
    expect(metrics.textMismatches).toBe(1);
  });

  it("prefers the provider's reported cost over the local estimate", () => {
    const record = makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN, {
      usage: { inputTokens: 10, outputTokens: 5, estimatedCost: 0.01, reportedCost: 0.004 },
    });
    const metrics = computeVisibilityMetrics("model-a", [gradeRecord(record, image)]);
    expect(metrics.totalCost).toBeCloseTo(0.004);
    expect(metrics.meanCostPerRun).toBeCloseTo(0.004);
  });

  it("summarises latency and tokens over ok runs", () => {
    const metrics = computeVisibilityMetrics("model-a", cells());
    expect(metrics.latencyMedianSeconds).toBeCloseTo(2);
    expect(metrics.meanInputTokens).toBeCloseTo(100);
    expect(metrics.meanOutputTokens).toBeCloseTo(50);
    expect(metrics.meanReasoningTokens).toBeNull();
  });
});

describe("sortVisibilityLeaderboard", () => {
  function metrics(partial: Partial<VisibilityModelMetrics>): VisibilityModelMetrics {
    return {
      series: "m",
      model: "m",
      provider: "anthropic",
      reasoningEffort: "medium",
      imageFidelity: "auto",
      okRuns: 1,
      failedRuns: 0,
      invalidRuns: 0,
      accuracy: 1,
      presentRecall: 1,
      absentAccuracy: 1,
      visiblePromptAccuracy: 1,
      hiddenPromptAccuracy: 1,
      allCorrectRate: 1,
      flakiness: 0,
      textMismatches: 0,
      latencyMedianSeconds: null,
      latencyP95Seconds: null,
      meanCostPerRun: null,
      totalCost: null,
      meanInputTokens: null,
      meanOutputTokens: null,
      meanReasoningTokens: null,
      ...partial,
    };
  }

  it("ranks by accuracy first", () => {
    const sorted = sortVisibilityLeaderboard([
      metrics({ series: "low", accuracy: 0.5 }),
      metrics({ series: "high", accuracy: 0.9 }),
    ]);
    expect(sorted.map((m) => m.series)).toEqual(["high", "low"]);
  });

  it("breaks an accuracy tie on absent accuracy", () => {
    const sorted = sortVisibilityLeaderboard([
      metrics({ series: "hallucinator", absentAccuracy: 0.4 }),
      metrics({ series: "cautious", absentAccuracy: 0.9 }),
    ]);
    expect(sorted[0]?.series).toBe("cautious");
  });

  it("puts unscored rows last", () => {
    const sorted = sortVisibilityLeaderboard([
      metrics({ series: "unscored", accuracy: null }),
      metrics({ series: "scored", accuracy: 0.1 }),
    ]);
    expect(sorted.map((m) => m.series)).toEqual(["scored", "unscored"]);
  });
});

describe("buildVisibilityScores", () => {
  it("grades current records and groups them into series", () => {
    const scores = buildVisibilityScores(
      [
        makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN),
        makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN, { model: "model-b", provider: "google" }),
      ],
      [image],
      "sample-set",
      new Date("2026-09-06T12:00:00.000Z"),
    );
    expect(scores.models.map((m) => m.series).sort()).toEqual(["model-a", "model-b"]);
    expect(scores.staleRecords).toBe(0);
    expect(VisibilityScoresSchema.parse(scores)).toBeDefined();
  });

  it("drops and counts records whose prompt no longer matches", () => {
    const scores = buildVisibilityScores(
      [
        makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN),
        makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN, { rep: 2, promptHash: "old" }),
      ],
      [image],
      "sample-set",
    );
    expect(scores.staleRecords).toBe(1);
    expect(scores.cells).toHaveLength(1);
  });

  it("drops records for an image the ground truth no longer lists", () => {
    const scores = buildVisibilityScores(
      [makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN, { filename: "gone.png" })],
      [image],
      "sample-set",
    );
    expect(scores.staleRecords).toBe(1);
    expect(scores.models).toEqual([]);
  });

  it("regrades unchanged records when an element's expected answer flips", () => {
    const records = [makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN)];
    // Drop the `| FALSE` on the chewing gum logo: it is now expected visible.
    const flipped: VisibilityImage = {
      ...image,
      expectedVisible: ["Title", "Search bar", "Chewing gum logo"],
    };
    expect(buildVisibilityScores(records, [image], "d").models[0]?.accuracy).toBeCloseTo(1);
    const after = buildVisibilityScores(records, [flipped], "d");
    expect(after.staleRecords).toBe(0);
    expect(after.models[0]?.accuracy).toBeCloseTo(3 / 4);
  });
});

describe("renderingSeries", () => {
  it("leaves the default, rendering-judged setting untagged", () => {
    expect(renderingSeries("grok-4.6", true)).toBe("grok-4.6");
    expect(renderingSeries("grok-4.6 (xhigh)", true)).toBe("grok-4.6 (xhigh)");
  });

  it("tags a presence-only run, folding into an existing parenthetical", () => {
    expect(renderingSeries("grok-4.6", false)).toBe("grok-4.6 (presence-only)");
    expect(renderingSeries("grok-4.6 (xhigh, high-res)", false)).toBe(
      "grok-4.6 (xhigh, high-res, presence-only)",
    );
  });

  it("separates the two settings into different series when grading", () => {
    const on = gradeRecord(makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN), image);
    const off = gradeRecord(
      makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN, { requireCorrectRendering: false }),
      image,
    );
    expect(on.series).toBe("model-a");
    expect(off.series).toBe("model-a (presence-only)");
  });
});
