import { describe, expect, it } from "vitest";
import {
  SCORES_FILE_RE,
  buildResultsMarkdown,
  reportHtmlPathForJudge,
  resultsMdPathForJudge,
} from "../../bench/src/report.js";
import type { Manifest, Scores } from "../../bench/src/types.js";

const manifest: Manifest = {
  schemaVersion: 1,
  promptHash: "hash",
  generatedAt: "2026-07-23T00:00:00.000Z",
  entries: [{ imageId: "img_01", filename: "typo.png", sha256: "s1", expectedIssues: ["A typo"] }],
  retired: [],
};

const scores: Scores = {
  schemaVersion: 1,
  generatedAt: "2026-07-23T00:00:00.000Z",
  prompt: "What looks visually broken on this page?",
  promptHash: "hash",
  reasoningEffort: "medium",
  repeats: 5,
  judgeModel: "claude-haiku-4-5",
  judgePromptVersion: "v1",
  overrideCount: 0,
  models: [
    {
      model: "model-a",
      provider: "anthropic",
      okRuns: 5,
      failedRuns: 0,
      meanRecall: 0.8,
      anyRecall: 1,
      flakiness: 0.2,
      extrasPerRun: 1.2,
      noBugsCleanRate: null,
      latencyMedianSeconds: 10,
      latencyP95Seconds: 20,
      meanCostPerRun: 0.01,
      totalCost: 0.5,
      meanInputTokens: null,
      meanOutputTokens: null,
      meanReasoningTokens: null,
    },
  ],
  cells: [],
};

describe("buildResultsMarkdown", () => {
  it("orders sections: prompt + judge, matrix, leaderboard", () => {
    const md = buildResultsMarkdown(scores, manifest);
    const promptAt = md.indexOf("What looks visually broken on this page?");
    const judgeAt = md.indexOf("claude-haiku-4-5");
    const matrixAt = md.indexOf("## Screenshot × model matrix");
    const leaderboardAt = md.indexOf("## Leaderboard");
    expect(promptAt).toBeGreaterThan(-1);
    expect(judgeAt).toBeGreaterThan(-1);
    expect(matrixAt).toBeGreaterThan(promptAt);
    expect(leaderboardAt).toBeGreaterThan(matrixAt);
  });

  it("includes the matrix row for each screenshot", () => {
    const md = buildResultsMarkdown(scores, manifest);
    expect(md).toContain("typo.png");
    expect(md).toContain("A typo");
  });
});

describe("per-judge report paths", () => {
  it("embed the sanitized judge slug", () => {
    expect(resultsMdPathForJudge("claude-haiku-4-5")).toMatch(/RESULTS\.claude-haiku-4-5\.md$/);
    expect(reportHtmlPathForJudge("x-ai/grok-4.5")).toMatch(/report\.x-ai__grok-4\.5\.html$/);
  });
});

describe("SCORES_FILE_RE", () => {
  it("matches per-judge scores files and rejects the legacy scores.json", () => {
    expect(SCORES_FILE_RE.test("scores.claude-haiku-4-5.json")).toBe(true);
    expect(SCORES_FILE_RE.test("scores.x-ai__grok-4.5.json")).toBe(true);
    expect(SCORES_FILE_RE.test("scores.json")).toBe(false);
    expect(SCORES_FILE_RE.test("manifest.json")).toBe(false);
  });
});
