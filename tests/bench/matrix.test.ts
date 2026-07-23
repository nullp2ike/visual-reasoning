import { describe, expect, it } from "vitest";
import { buildMatrix, buildMatrixMarkdown, formatMatrixCell } from "../../bench/src/matrix.js";
import type { Manifest, ResolvedCell, Scores } from "../../bench/src/types.js";

const manifest: Manifest = {
  schemaVersion: 1,
  promptHash: "hash",
  generatedAt: "2026-07-23T00:00:00.000Z",
  entries: [
    { imageId: "img_01", filename: "typo.png", sha256: "s1", expectedIssues: ["A typo"] },
    { imageId: "img_02", filename: "clean.png", sha256: "s2", expectedIssues: [] },
  ],
  retired: [],
};

function cell(overrides: Partial<ResolvedCell>): ResolvedCell {
  return {
    model: "model-a",
    imageId: "img_01",
    rep: 1,
    status: "ok",
    reportedIssues: [],
    expected: [
      {
        expectedIndex: 0,
        found: true,
        matchedReportedIndexes: [0],
        reasoning: "match",
        overridden: false,
      },
    ],
    extraReportedIndexes: [],
    overridden: false,
    ...overrides,
  };
}

function scores(
  cells: ResolvedCell[],
  models: (string | { model: string; provider: string })[] = ["model-a"],
): Scores {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-23T00:00:00.000Z",
    prompt: "What looks broken?",
    promptHash: "hash",
    reasoningEffort: "medium",
    repeats: 3,
    judgeModel: "judge-x",
    judgePromptVersion: "v1",
    overrideCount: 0,
    models: models.map((entry) => ({
      model: typeof entry === "string" ? entry : entry.model,
      provider: typeof entry === "string" ? "anthropic" : entry.provider,
      okRuns: 1,
      failedRuns: 0,
      meanRecall: null,
      anyRecall: null,
      flakiness: null,
      extrasPerRun: null,
      noBugsCleanRate: null,
      latencyMedianSeconds: null,
      latencyP95Seconds: null,
      meanCostPerRun: null,
      totalCost: null,
      meanInputTokens: null,
      meanOutputTokens: null,
      meanReasoningTokens: null,
    })),
    cells,
  };
}

describe("buildMatrix", () => {
  it("counts reps where every expected issue was found", () => {
    const matrix = buildMatrix(
      scores([
        cell({ rep: 1 }),
        cell({
          rep: 2,
          expected: [
            {
              expectedIndex: 0,
              found: false,
              matchedReportedIndexes: [],
              reasoning: "missed",
              overridden: false,
            },
          ],
        }),
        cell({ rep: 3 }),
      ]),
      manifest,
    );
    const c = matrix.rows[0]!.cells[0]!;
    expect(c.foundReps).toBe(2);
    expect(c.okReps).toBe(3);
    expect(c.totalReps).toBe(3);
    expect(c.cleanReps).toBeNull();
  });

  it("counts clean reps for images with no expected issues", () => {
    const matrix = buildMatrix(
      scores([
        cell({ imageId: "img_02", rep: 1, expected: [] }),
        cell({
          imageId: "img_02",
          rep: 2,
          expected: [],
          reportedIssues: [
            { priority: "minor", category: "content", description: "noise", suggestion: "-" },
          ],
          extraReportedIndexes: [0],
        }),
      ]),
      manifest,
    );
    const c = matrix.rows[1]!.cells[0]!;
    expect(c.cleanReps).toBe(1);
    expect(c.okReps).toBe(2);
    expect(c.foundReps).toBeNull();
  });

  it("error reps shrink the ok denominator but count toward totalReps", () => {
    const matrix = buildMatrix(
      scores([
        cell({ rep: 1 }),
        cell({ rep: 2, status: "error", expected: [], error: { name: "E", message: "boom" } }),
      ]),
      manifest,
    );
    const c = matrix.rows[0]!.cells[0]!;
    expect(c.okReps).toBe(1);
    expect(c.totalReps).toBe(2);
    expect(c.foundReps).toBe(1);
    expect(c.hasErrors).toBe(true);
  });

  it("counts override-found reps and flags the cell", () => {
    const matrix = buildMatrix(
      scores([
        cell({
          rep: 1,
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
        }),
      ]),
      manifest,
    );
    const c = matrix.rows[0]!.cells[0]!;
    expect(c.foundReps).toBe(1);
    expect(c.hasOverride).toBe(true);
  });

  it("groups columns by provider (openai, anthropic, google, openrouter)", () => {
    const matrix = buildMatrix(
      scores(
        [cell({})],
        [
          { model: "moonshotai/kimi-k2.7-code", provider: "openrouter" },
          { model: "claude-sonnet-4-6", provider: "anthropic" },
          { model: "gemini-3.5-flash", provider: "google" },
          { model: "gpt-5.6-sol", provider: "openai" },
        ],
      ),
      manifest,
    );
    expect(matrix.models).toEqual([
      "gpt-5.6-sol",
      "claude-sonnet-4-6",
      "gemini-3.5-flash",
      "moonshotai/kimi-k2.7-code",
    ]);
  });

  it("keeps leaderboard order (stronger first) within a provider group", () => {
    const matrix = buildMatrix(
      scores(
        [cell({})],
        [
          // Leaderboard order: luna outranks terra.
          { model: "gpt-5.6-luna", provider: "openai" },
          { model: "claude-sonnet-4-6", provider: "anthropic" },
          { model: "gpt-5.6-terra", provider: "openai" },
        ],
      ),
      manifest,
    );
    expect(matrix.models).toEqual(["gpt-5.6-luna", "gpt-5.6-terra", "claude-sonnet-4-6"]);
  });
});

describe("formatMatrixCell", () => {
  it("renders found counts, dagger for failed reps, clean cells, and empties", () => {
    expect(
      formatMatrixCell({
        model: "m",
        imageId: "i",
        okReps: 3,
        totalReps: 3,
        foundReps: 2,
        cleanReps: null,
        hasErrors: false,
        hasOverride: false,
      }),
    ).toBe("2/3");
    expect(
      formatMatrixCell({
        model: "m",
        imageId: "i",
        okReps: 2,
        totalReps: 3,
        foundReps: 1,
        cleanReps: null,
        hasErrors: true,
        hasOverride: false,
      }),
    ).toBe("1/2†");
    expect(
      formatMatrixCell({
        model: "m",
        imageId: "i",
        okReps: 2,
        totalReps: 2,
        foundReps: null,
        cleanReps: 2,
        hasErrors: false,
        hasOverride: false,
      }),
    ).toBe("clean 2/2");
    expect(
      formatMatrixCell({
        model: "m",
        imageId: "i",
        okReps: 0,
        totalReps: 0,
        foundReps: null,
        cleanReps: null,
        hasErrors: false,
        hasOverride: false,
      }),
    ).toBe("–");
  });
});

describe("buildMatrixMarkdown", () => {
  it("renders one row per image with description and one column per model", () => {
    const md = buildMatrixMarkdown(buildMatrix(scores([cell({})]), manifest));
    expect(md).toContain("| Screenshot |");
    expect(md).toContain("model-a");
    expect(md).toContain("typo.png");
    expect(md).toContain("A typo");
    expect(md).toContain("1/1");
    expect(md).toContain("no expected issues");
  });

  it("truncates long expected descriptions", () => {
    const longManifest: Manifest = {
      ...manifest,
      entries: [
        {
          imageId: "img_01",
          filename: "typo.png",
          sha256: "s1",
          expectedIssues: ["X".repeat(200)],
        },
      ],
    };
    const md = buildMatrixMarkdown(buildMatrix(scores([cell({})]), longManifest));
    expect(md).toContain("…");
    expect(md).not.toContain("X".repeat(100));
  });
});
