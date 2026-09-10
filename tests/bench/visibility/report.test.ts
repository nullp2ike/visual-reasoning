import { describe, expect, it } from "vitest";
import {
  buildVisibilityResultsMarkdown,
  uniformityWarnings,
} from "../../../bench/visibility/src/report.js";
import { buildVisibilityScores } from "../../../bench/visibility/src/grade.js";
import type {
  VisibilityCall,
  VisibilityImage,
  VisibilityRunRecord,
  VisibilityScores,
} from "../../../bench/visibility/src/types.js";

/**
 * "Chewing gum logo" sits under `### visible` with `| FALSE`, so it is asked
 * with the visible prompt but expected absent — the near-miss case.
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
        statements: image.visibleCall.map((element, i) => ({
          statement: `The element "${element}" is fully visible on the page`,
          pass: visiblePasses[i] ?? false,
          reasoning: "because",
        })),
      },
    },
    {
      mode: "hidden",
      elements: image.hiddenCall,
      status: "ok",
      result: {
        pass: hiddenPasses.every(Boolean),
        reasoning: "r",
        statements: image.hiddenCall.map((element, i) => ({
          statement: `The element "${element}" is NOT visible on the page`,
          pass: hiddenPasses[i] ?? false,
          reasoning: "because",
        })),
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
    usage: { inputTokens: 100, outputTokens: 50, estimatedCost: 0.002, durationSeconds: 1.5 },
    ...partial,
  };
}

const PERFECT_VISIBLE = [false, true];
const PERFECT_HIDDEN = [true, false];

function scoresFrom(
  records: VisibilityRunRecord[],
  images: VisibilityImage[] = [image],
): VisibilityScores {
  return buildVisibilityScores(records, images, "sample-set", new Date("2026-09-06T12:00:00.000Z"));
}

describe("buildVisibilityResultsMarkdown", () => {
  it("orders the sections matrix, per-element, leaderboard", () => {
    const md = buildVisibilityResultsMarkdown(
      scoresFrom([makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN)]),
    );
    expect(md.indexOf("## Image × model matrix")).toBeLessThan(
      md.indexOf("## Per-element breakdown"),
    );
    expect(md.indexOf("## Per-element breakdown")).toBeLessThan(md.indexOf("## Leaderboard"));
  });

  it("renders the per-statement pivot between the breakdown and the leaderboard", () => {
    // Chewing gum logo is answered "visible" here, which is wrong in its one file.
    const md = buildVisibilityResultsMarkdown(
      scoresFrom([makeRecord([true, true], PERFECT_HIDDEN)]),
    );
    expect(md.indexOf("## Per-element breakdown")).toBeLessThan(
      md.indexOf("## Per-statement pivot"),
    );
    expect(md.indexOf("## Per-statement pivot")).toBeLessThan(md.indexOf("## Leaderboard"));
    expect(md).toMatch(/\| Chewing gum logo \| is it visible\? \| 1\/1 \|/);
    expect(md).toMatch(/\| Title \| is it visible\? \| 0\/1 \|/);
    // Worst wording first.
    expect(md.indexOf("| Chewing gum logo | is it visible?")).toBeLessThan(
      md.indexOf("| Title | is it visible?"),
    );
  });

  it("shows which prompt asked about each element alongside the expected answer", () => {
    const md = buildVisibilityResultsMarkdown(
      scoresFrom([makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN)]),
    );
    expect(md).toMatch(/\| Title \| is it visible\? \| visible \|/);
    expect(md).toMatch(/\| Gear icon \| is it hidden\? \| absent \|/);
    // The near-miss: asked with the visible prompt, but expected absent.
    expect(md).toMatch(/\| Chewing gum logo \| is it visible\? \| absent \|/);
    // The inverted absent bullet: asked with the hidden prompt, expected visible.
    expect(md).toMatch(/\| Search bar \| is it hidden\? \| visible \|/);
  });

  it("splits leaderboard accuracy by prompt mode", () => {
    const md = buildVisibilityResultsMarkdown(
      // Gets the hidden call fully wrong, the visible call fully right.
      scoresFrom([makeRecord(PERFECT_VISIBLE, [false, true])]),
    );
    expect(md).toContain("| Visible prompt | Hidden prompt |".replaceAll("|", "|"));
    expect(md).toMatch(
      /\| model-a \| anthropic \| medium \| 50% \| 50% \| 50% \| 50% \| 100% \| 0% \|/,
    );
  });

  it("renders a leaderboard row for each model", () => {
    const md = buildVisibilityResultsMarkdown(
      scoresFrom([
        makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN),
        makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN, { model: "model-b", provider: "google" }),
      ]),
    );
    expect(md).toMatch(/\| model-a \| anthropic \| medium \| 100% \|/);
    expect(md).toMatch(/\| model-b \| google \| medium \| 100% \|/);
  });

  it("ranks the more accurate model first", () => {
    const md = buildVisibilityResultsMarkdown(
      scoresFrom([
        makeRecord([true, true], [true, true], { model: "hallucinator" }),
        makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN, { model: "accurate" }),
      ]),
    );
    expect(md.indexOf("| accurate |")).toBeLessThan(md.indexOf("| hallucinator |"));
  });

  it("shows the hallucination rate as the complement of absent accuracy", () => {
    // Confirms both absent elements: absent accuracy 0%, hallucination 100%.
    const md = buildVisibilityResultsMarkdown(
      scoresFrom([makeRecord([true, true], [false, false])]),
    );
    expect(md).toMatch(/\| model-a \| anthropic \| medium \| 50% \| 100% \| 0% \| 100% \|/);
  });

  it("reports per-element correctness per model", () => {
    const md = buildVisibilityResultsMarkdown(
      scoresFrom([
        makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN),
        makeRecord([true, true], PERFECT_HIDDEN, { rep: 2 }),
      ]),
    );
    expect(md).toMatch(/\| Chewing gum logo \| is it visible\? \| absent \| 1\/2 \|/);
    expect(md).toMatch(/\| Title \| is it visible\? \| visible \| 2\/2 \|/);
  });

  it("marks a matrix cell whose denominator shrank", () => {
    const failed = makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN, { rep: 2, status: "error" });
    const call = failed.calls[0];
    if (call) {
      call.status = "error";
      call.result = undefined;
    }
    const md = buildVisibilityResultsMarkdown(
      scoresFrom([makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN), failed]),
    );
    expect(md).toMatch(/1\/1 · 100%†/);
  });

  it("notes stale records only when some exist", () => {
    const clean = buildVisibilityResultsMarkdown(
      scoresFrom([makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN)]),
    );
    expect(clean).not.toContain("stale record");

    const stale = buildVisibilityResultsMarkdown(
      scoresFrom([
        makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN),
        makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN, { rep: 2, promptHash: "old" }),
      ]),
    );
    expect(stale).toMatch(/\*\*1 stale record\(s\) ignored\.\*\*/);
  });

  it("renders a placeholder when nothing has been graded", () => {
    const md = buildVisibilityResultsMarkdown(scoresFrom([], [image]));
    expect(md).toContain("_No graded runs._");
    expect(md).toContain("## Leaderboard");
  });

  it("states the dataset, image and element counts", () => {
    const md = buildVisibilityResultsMarkdown(
      scoresFrom([makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN)]),
    );
    expect(md).toContain("`sample-set` — 1 image(s), 4 element(s) under test");
  });
});

describe("uniformityWarnings", () => {
  it("stays quiet when both calls mix their expected answers", () => {
    expect(uniformityWarnings(scoresFrom([makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN)]))).toEqual(
      [],
    );
  });

  it("warns when every element in a call expects the same answer", () => {
    const uniform: VisibilityImage = {
      ...image,
      expectedVisible: ["Title", "Chewing gum logo"],
    };
    const warnings = uniformityWarnings(
      scoresFrom([makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN)], [uniform]),
    );
    expect(warnings.join("\n")).toMatch(/Uniform answers.*is it visible\?/s);
    expect(warnings.join("\n")).toMatch(/Uniform answers.*is it hidden\?/s);
  });

  it("ignores a call with a single element, where uniformity is unavoidable", () => {
    const single: VisibilityImage = {
      ...image,
      visibleCall: ["Title"],
      hiddenCall: ["Gear icon"],
      elements: ["Gear icon", "Title"],
      expectedVisible: ["Title"],
    };
    expect(uniformityWarnings(scoresFrom([], [single]))).toEqual([]);
  });

  it("appears in the rendered report", () => {
    const uniform: VisibilityImage = { ...image, expectedVisible: ["Title", "Chewing gum logo"] };
    const md = buildVisibilityResultsMarkdown(
      scoresFrom([makeRecord(PERFECT_VISIBLE, PERFECT_HIDDEN)], [uniform]),
    );
    expect(md).toContain("**Uniform answers:**");
  });
});
