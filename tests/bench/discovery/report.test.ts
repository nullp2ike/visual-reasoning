import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  SCORES_FILE_RE,
  buildResultsMarkdown,
  reportHtmlPathForJudge,
  resultsMdPathForJudge,
} from "../../../bench/discovery/src/report.js";
import { buildReportHtml } from "../../../bench/discovery/src/html.js";
import type { Manifest, Scores } from "../../../bench/discovery/src/types.js";

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
    prompt: "What looks visually broken on this page?",
    promptHash: "hash",
    reasoningEffort: "medium",
    repeats: 5,
    judgeModel: "gemini-3.8-flash",
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
        cacheHitRate: null,
      },
    ],
    cells: [],
    ...overrides,
  };
}

const scores = makeScores();

/** A Jev-style scored cell: R0 matched confidently, R1 an uncertain extra. */
const decisionScores = makeScores({
  judgeModel: "typesafe/jev-1.13",
  cells: [
    {
      model: "model-a",
      series: "model-a",
      imageId: "img_01",
      rep: 1,
      status: "ok",
      reportedIssues: [
        { priority: "major", category: "content", description: "Typo in title", suggestion: "fix" },
        { priority: "minor", category: "layout", description: "Card spacing", suggestion: "fix" },
      ],
      expected: [
        {
          expectedIndex: 0,
          found: true,
          matchedReportedIndexes: [0],
          reasoning: "Jev matched R0 (p=0.99, confidence 0.98).",
          overridden: false,
        },
      ],
      extraReportedIndexes: [1],
      overridden: false,
      decisions: [
        { reportedIndex: 0, expectedIndex: 0, probability: 0.99, confidence: 0.98 },
        { reportedIndex: 1, expectedIndex: null, probability: 0.62, confidence: 0.24 },
      ],
    },
  ],
});

describe("buildResultsMarkdown", () => {
  it("orders sections: prompt + judge, matrix, leaderboard", () => {
    const md = buildResultsMarkdown(scores, manifest);
    const promptAt = md.indexOf("What looks visually broken on this page?");
    const judgeAt = md.indexOf("gemini-3.8-flash");
    const matrixAt = md.indexOf("## Screenshot × model matrix");
    const leaderboardAt = md.indexOf("## Leaderboard");
    expect(promptAt).toBeGreaterThan(-1);
    expect(judgeAt).toBeGreaterThan(-1);
    expect(matrixAt).toBeGreaterThan(promptAt);
    expect(leaderboardAt).toBeGreaterThan(matrixAt);
  });

  it("shows the prompt under a plain heading, with no variant", () => {
    const md = buildResultsMarkdown(makeScores({ prompt: "Dataset prompt" }), manifest);
    expect(md).toContain("## Prompt\n\n```text\nDataset prompt\n```");
    expect(md).not.toContain("variant");
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

describe("buildResultsMarkdown judge confidence", () => {
  it("summarises a decision judge's confidence and lists the least confident decisions", () => {
    const md = buildResultsMarkdown(decisionScores, manifest);
    expect(md).toContain("## Judge confidence");
    expect(md).toContain("| 0.00–0.50 | 1 |");
    expect(md).toContain("| 0.95–1.00 | 1 |");
    expect(md).toContain("1 of 1 judged run(s) have a decision below confidence 0.80");
    expect(md).toContain("| model-a | img_01 | 1 | R1 | extra | 0.62 | 0.24 | Card spacing |");
  });

  it("omits the section for chat-model judges, which report no confidence", () => {
    expect(buildResultsMarkdown(scores, manifest)).not.toContain("Judge confidence");
  });
});

describe("report paths", () => {
  it("embed the sanitized judge slug", () => {
    expect(resultsMdPathForJudge("gemini-3.8-flash")).toMatch(/RESULTS\.gemini-3\.8-flash\.md$/);
    expect(reportHtmlPathForJudge("x-ai/grok-4.5")).toMatch(/report\.x-ai__grok-4\.5\.html$/);
  });
});

describe("SCORES_FILE_RE", () => {
  it("matches per-judge scores files and captures the judge slug", () => {
    expect(SCORES_FILE_RE.exec("scores.gpt-5.6-luna.json")?.[1]).toBe("gpt-5.6-luna");
    expect(SCORES_FILE_RE.exec("scores.x-ai__grok-4.5.json")?.[1]).toBe("x-ai__grok-4.5");
  });

  it("rejects unversioned and non-scores files", () => {
    expect(SCORES_FILE_RE.test("scores.json")).toBe(false);
    expect(SCORES_FILE_RE.test("manifest.json")).toBe(false);
  });
});

describe("buildReportHtml", () => {
  it("renders one prompt with no variant switcher or compare toggle", () => {
    const html = buildReportHtml(makeScores({ prompt: "Dataset prompt" }), manifest, {});
    expect(html).toContain("Dataset prompt");
    expect(html).not.toContain('id="variant"');
    expect(html).not.toContain('id="compare-variants"');
    expect(html).not.toContain("scoresByVariant");
    expect(html).not.toContain("Prompt variant");
  });

  function inlineScript(html: string): string {
    const match = /<script>\n([\s\S]*?)<\/script>/.exec(html);
    expect(match).not.toBeNull();
    return match?.[1] ?? "";
  }

  it("emits a syntactically valid inline script", () => {
    // The interactive report is a single inline <script>; a malformed string
    // (e.g. an unescaped quote in a column tooltip) silently breaks all rendering.
    // Compiling with vm.Script parses the body without executing it, so a
    // SyntaxError surfaces here while DOM globals are never touched.
    for (const readOnly of [false, true]) {
      const html = buildReportHtml(
        scores,
        manifest,
        {},
        {
          siblingJudges: ["gpt-5.6-luna"],
          readOnly,
        },
      );
      expect(() => new Script(inlineScript(html))).not.toThrow();
    }
  });

  it("links sibling judges' reports and the comparison", () => {
    const html = buildReportHtml(scores, manifest, {}, { siblingJudges: ["x-ai/grok-4.5"] });
    expect(html).toContain('<a href="report.x-ai__grok-4.5.html">x-ai/grok-4.5</a>');
    expect(html).toContain('<a href="JUDGE_COMPARISON.md">comparison</a>');
  });

  it("links the comparison through a caller-supplied href", () => {
    const html = buildReportHtml(
      scores,
      manifest,
      {},
      {
        siblingJudges: ["x-ai/grok-4.5"],
        comparisonHref: "comparison.html",
      },
    );
    expect(html).toContain('<a href="comparison.html">comparison</a>');
    expect(html).not.toContain("JUDGE_COMPARISON.md");
  });

  it("offers override editing and export by default", () => {
    const html = buildReportHtml(scores, manifest, {});
    expect(html).toContain('<button id="export">');
    expect(html).toContain("<body>");
    expect(html).toContain("const READ_ONLY = false;");
  });

  it("drops override editing and export in read-only mode", () => {
    const html = buildReportHtml(scores, manifest, {}, { readOnly: true });
    expect(html).not.toContain('<button id="export">');
    expect(html).not.toContain('<div class="toolbar">');
    expect(html).toContain('<body class="read-only">');
    expect(html).toContain("const READ_ONLY = true;");
  });

  it("adds a judge-confidence section and per-issue badges for a decision judge", () => {
    const html = buildReportHtml(decisionScores, manifest, {});
    expect(html).toContain('<section id="confidence">');
    expect(html).toContain("function decisionBadge(");
    expect(html).toContain('"confidence":0.24');
    expect(() => new Script(inlineScript(html))).not.toThrow();
  });

  it("has no confidence section for a chat-model judge", () => {
    expect(buildReportHtml(scores, manifest, {})).not.toContain('<section id="confidence">');
  });

  it("shows the per-model reasoning effort in the leaderboard column set", () => {
    const html = buildReportHtml(scores, manifest, {});
    expect(html).toContain('"reasoningEffort", "Effort"');
  });

  it("links screenshots through the caller-supplied image base, not a fixed path", () => {
    const html = buildReportHtml(scores, manifest, {}, { imageBase: "../../datasets/my-set" });
    expect(html).toContain('"imageBase":"../../datasets/my-set"');
    // No dataset directory name may be baked into the page's markup.
    expect(html).not.toContain("golden_data_set");
    expect(html).toContain("const IMAGE_BASE = DATA.imageBase;");
  });

  it("strips a trailing slash from the image base so hrefs never double up", () => {
    const html = buildReportHtml(scores, manifest, {}, { imageBase: "../../datasets/my-set/" });
    expect(html).toContain('"imageBase":"../../datasets/my-set"');
  });
});
