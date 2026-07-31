import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  SCORES_FILE_RE,
  buildResultsMarkdown,
  orderVariants,
  reportHtmlPathForJudge,
  resultsMdPathForVariantJudge,
} from "../../bench/src/report.js";
import { buildReportHtml, type VariantScores } from "../../bench/src/html.js";
import type { Manifest, Scores } from "../../bench/src/types.js";

const manifest: Manifest = {
  schemaVersion: 1,
  promptHash: "hash",
  generatedAt: "2026-07-23T00:00:00.000Z",
  entries: [{ imageId: "img_01", filename: "typo.png", sha256: "s1", expectedIssues: ["A typo"] }],
  retired: [],
};

function makeScores(overrides: Partial<Scores> = {}): Scores {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-23T00:00:00.000Z",
    promptVariant: "baseline",
    prompt: "What looks visually broken on this page?",
    promptHash: "hash",
    reasoningEffort: "medium",
    repeats: 5,
    judgeModel: "claude-haiku-4-5",
    judgePromptVersion: "v1",
    overrideCount: 0,
    models: [
      {
        series: "model-a",
        model: "model-a",
        provider: "anthropic",
        reasoningEffort: "medium",
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
    ...overrides,
  };
}

const scores = makeScores();

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

  it("names the prompt variant in the heading", () => {
    expect(buildResultsMarkdown(makeScores({ promptVariant: "excluded" }), manifest)).toContain(
      "variant: `excluded`",
    );
  });

  it("includes the matrix row for each screenshot", () => {
    const md = buildResultsMarkdown(scores, manifest);
    expect(md).toContain("typo.png");
    expect(md).toContain("A typo");
  });

  it("shows the per-model reasoning effort in the leaderboard", () => {
    const md = buildResultsMarkdown(scores, manifest);
    expect(md).toContain("| Model | Provider | Effort |");
    // The fixture model runs at medium effort — it must appear in its row.
    expect(md).toMatch(/\| model-a \| anthropic \| medium \|/);
  });
});

describe("report paths", () => {
  it("embed the variant and sanitized judge slug", () => {
    expect(resultsMdPathForVariantJudge("baseline", "claude-haiku-4-5")).toMatch(
      /RESULTS\.baseline\.claude-haiku-4-5\.md$/,
    );
    expect(reportHtmlPathForJudge("x-ai/grok-4.5")).toMatch(/report\.x-ai__grok-4\.5\.html$/);
  });
});

describe("orderVariants", () => {
  it("returns present variants in canonical order (baseline first)", () => {
    expect(orderVariants(new Set(["excluded", "baseline"]))).toEqual(["baseline", "excluded"]);
  });

  it("drops unknown variant ids", () => {
    expect(orderVariants(new Set(["baseline", "nonsense"]))).toEqual(["baseline"]);
  });
});

describe("SCORES_FILE_RE", () => {
  it("matches per-(variant, judge) scores files", () => {
    expect(SCORES_FILE_RE.test("scores.baseline.claude-haiku-4-5.json")).toBe(true);
    expect(SCORES_FILE_RE.test("scores.excluded.x-ai__grok-4.5.json")).toBe(true);
  });

  it("rejects unversioned and non-scores files", () => {
    expect(SCORES_FILE_RE.test("scores.json")).toBe(false);
    expect(SCORES_FILE_RE.test("manifest.json")).toBe(false);
  });
});

describe("buildReportHtml", () => {
  const baseline: VariantScores = { variant: "baseline", scores: makeScores() };
  const excluded: VariantScores = {
    variant: "excluded",
    scores: makeScores({ promptVariant: "excluded", prompt: "Excluded prompt text" }),
  };

  it("renders an in-page variant switcher when multiple variants exist", () => {
    const html = buildReportHtml([baseline, excluded], manifest, {});
    expect(html).toContain('<select id="variant">');
    expect(html).toContain('<option value="baseline">');
    expect(html).toContain('<option value="excluded">');
    // Both variants' scored data is embedded so the toggle can swap client-side.
    expect(html).toContain('"scoresByVariant"');
    expect(html).toContain("Excluded prompt text");
  });

  it("offers a compare checkbox (matrix + leaderboard) when multiple variants exist", () => {
    const multi = buildReportHtml([baseline, excluded], manifest, {});
    expect(multi).toContain('id="compare-variants"');
    // Names the comparison variant and states it applies to both tables.
    expect(multi).toContain("<code>excluded</code>");
    expect(multi).toContain("matrix &amp; leaderboard");
    // A single-variant report has nothing to compare, so no checkbox.
    const single = buildReportHtml([baseline], manifest, {});
    expect(single).not.toContain('id="compare-variants"');
  });

  it("emits a syntactically valid inline script", () => {
    const html = buildReportHtml([baseline, excluded], manifest, {});
    // The interactive report is a single inline <script>; a malformed string
    // (e.g. an unescaped quote in a column tooltip) silently breaks all rendering.
    const match = /<script>\n([\s\S]*?)<\/script>/.exec(html);
    expect(match).not.toBeNull();
    // Compiling with vm.Script parses the body without executing it, so a
    // SyntaxError surfaces here while DOM globals are never touched.
    expect(() => new Script(match![1] ?? "")).not.toThrow();
  });

  it("shows the per-model reasoning effort in the leaderboard column set", () => {
    const html = buildReportHtml([baseline], manifest, {});
    expect(html).toContain('"reasoningEffort", "Effort"');
  });

  it("shows a static badge (no switcher) for a single variant", () => {
    const html = buildReportHtml([baseline], manifest, {});
    expect(html).not.toContain('<select id="variant">');
    expect(html).toContain("Prompt variant: baseline");
  });

  it("links screenshots through the caller-supplied image base, not a fixed path", () => {
    const html = buildReportHtml([baseline], manifest, {}, [], "../../datasets/my-set");
    expect(html).toContain('"imageBase":"../../datasets/my-set"');
    // No dataset directory name may be baked into the page's markup.
    expect(html).not.toContain("golden_data_set");
    expect(html).toContain("const IMAGE_BASE = DATA.imageBase;");
  });

  it("strips a trailing slash from the image base so hrefs never double up", () => {
    const html = buildReportHtml([baseline], manifest, {}, [], "../../datasets/my-set/");
    expect(html).toContain('"imageBase":"../../datasets/my-set"');
  });

  it("throws when given no variants", () => {
    expect(() => buildReportHtml([], manifest, {})).toThrow();
  });
});
