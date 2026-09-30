import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  JEV_PROMPT_VERSION,
  buildJevRequest,
  isDecisionJudge,
  parseJevResponse,
  verdictFromJev,
} from "../../../bench/discovery/src/jev.js";
import {
  JUDGE_PROMPT_VERSION,
  judgeCacheKey,
  judgePromptVersion,
  judgeRun,
  type JudgeRequest,
} from "../../../bench/discovery/src/judge.js";
import { resolveCell } from "../../../bench/discovery/src/score.js";
import type { RunRecord } from "../../../bench/discovery/src/types.js";
import type { Issue } from "../../../src/types.js";

function issue(description: string): Issue {
  return { priority: "major", category: "content", description, suggestion: "fix it" };
}

const request: JudgeRequest = {
  expectedIssues: ["Discount badge shows −0%"],
  reportedIssues: [
    issue("The pizza card shows a −0% discount badge"),
    issue("The heart button on the same card is low contrast"),
  ],
};

function answer(choice: string, pChoice: number, confidence: number, options = ["E0", "none"]) {
  const probabilities = Object.fromEntries(
    options.map((o) => [o, o === choice ? pChoice : (1 - pChoice) / (options.length - 1)]),
  );
  return { type: "choice", choice, probabilities, confidence };
}

const response = {
  model: "typesafe/jev-1.13-20260917",
  answers: { R0: answer("E0", 0.97, 0.94), R1: answer("none", 0.88, 0.76) },
  usage: { input_tokens: 520, output_tokens: 40, cost: 0.00002 },
};

describe("isDecisionJudge", () => {
  it("recognises TypeSafe decision models, including the latest alias", () => {
    expect(isDecisionJudge("typesafe/jev-1.13")).toBe(true);
    expect(isDecisionJudge("~typesafe/jev-latest")).toBe(true);
  });

  it("leaves chat-model judges alone", () => {
    expect(isDecisionJudge("gpt-5.6-luna")).toBe(false);
    expect(isDecisionJudge("meta/muse-spark-1.3-contributor")).toBe(false);
  });
});

describe("buildJevRequest", () => {
  const body = buildJevRequest(request, "typesafe/jev-1.13");

  it("puts both issue lists in the state, keyed so questions can name them", () => {
    expect(body.model).toBe("typesafe/jev-1.13");
    expect(body.state.expected_defects).toEqual({ E0: "Discount badge shows −0%" });
    expect(body.state.reported_issues.R1).toBe(
      "[major/content] The heart button on the same card is low contrast",
    );
  });

  it("asks one choice question per reported issue, over every expected defect plus none", () => {
    expect(Object.keys(body.questions)).toEqual(["R0", "R1"]);
    const q = body.questions.R1;
    expect(q?.type).toBe("choice");
    expect(q?.instructions).toContain("R1");
    expect(Object.keys(q?.criteria ?? {})).toEqual(["E0", "none"]);
  });

  it("counts a separate problem in the same area as none (the v2 wording)", () => {
    expect(body.questions.R0?.criteria.none).toContain(
      "separate, additional problem in the same area",
    );
  });
});

describe("parseJevResponse", () => {
  it("accepts a well-formed response", () => {
    expect(parseJevResponse(response, request).answers.R0?.choice).toBe("E0");
  });

  it("rejects a response missing an answer for a reported issue", () => {
    expect(() =>
      parseJevResponse({ ...response, answers: { R0: response.answers.R0 } }, request),
    ).toThrow(/R1/);
  });

  it("rejects a choice that is not one of the offered options", () => {
    const bad = { ...response, answers: { ...response.answers, R1: answer("E7", 0.9, 0.8) } };
    expect(() => parseJevResponse(bad, request)).toThrow(/E7/);
  });

  it("rejects a malformed body", () => {
    expect(() => parseJevResponse({ answers: "nope" }, request)).toThrow();
  });
});

describe("verdictFromJev", () => {
  const verdict = verdictFromJev(parseJevResponse(response, request), request);

  it("derives found, matches and extras from the per-issue choices", () => {
    expect(verdict.expected[0]?.found).toBe(true);
    expect(verdict.expected[0]?.matchedReportedIndexes).toEqual([0]);
    expect(verdict.extraReportedIndexes).toEqual([1]);
  });

  it("records each decision's probability and Jev's own confidence", () => {
    expect(verdict.decisions).toEqual([
      { reportedIndex: 0, expectedIndex: 0, probability: 0.97, confidence: 0.94 },
      { reportedIndex: 1, expectedIndex: null, probability: 0.88, confidence: 0.76 },
    ]);
  });

  it("explains the verdict with probabilities in place of prose", () => {
    expect(verdict.expected[0]?.reasoning).toBe("Jev matched R0 (p=0.97, confidence 0.94).");
  });

  it("names the closest candidate when the defect is missed", () => {
    const missed = verdictFromJev(
      parseJevResponse(
        { answers: { R0: answer("none", 0.66, 0.32), R1: answer("none", 0.95, 0.9) } },
        request,
      ),
      request,
    );
    expect(missed.expected[0]?.found).toBe(false);
    expect(missed.expected[0]?.reasoning).toBe(
      "Jev matched no reported issue; closest was R0 (p=0.34).",
    );
    expect(missed.extraReportedIndexes).toEqual([0, 1]);
  });
});

describe("judgeRun with a decision judge", () => {
  it("calls the decisions endpoint instead of a chat completion, and caches the verdict", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "bench-jev-"));
    const decide = vi.fn().mockResolvedValue(response);
    const completion = vi.fn();
    const options = { judgeModel: "typesafe/jev-1.13", cacheDir, decide, completion };

    const first = await judgeRun(request, options);
    const second = await judgeRun(request, options);

    expect(decide).toHaveBeenCalledTimes(1);
    expect(completion).not.toHaveBeenCalled();
    expect(second).toEqual(first);
    expect(first.decisions?.[1]?.confidence).toBe(0.76);

    const [file] = await readdir(cacheDir);
    const entry = JSON.parse(await readFile(join(cacheDir, file ?? ""), "utf8")) as {
      judgePromptVersion: string;
    };
    expect(entry.judgePromptVersion).toBe(JEV_PROMPT_VERSION);
  });

  it("versions the cache separately from the chat judges", () => {
    expect(judgePromptVersion("typesafe/jev-1.13")).toBe(JEV_PROMPT_VERSION);
    expect(judgePromptVersion("gpt-5.6-luna")).toBe(JUDGE_PROMPT_VERSION);
    expect(judgeCacheKey(request, "typesafe/jev-1.13")).not.toBe(
      judgeCacheKey(request, "gpt-5.6-luna"),
    );
  });
});

describe("resolveCell", () => {
  it("carries the judge's decisions onto the scored cell", () => {
    const record: RunRecord = {
      schemaVersion: 1,
      model: "model-a",
      provider: "openai",
      imageId: "img_04",
      rep: 1,
      promptHash: "hash",
      reasoningEffort: "medium",
      timestamp: "2026-09-30T00:00:00.000Z",
      status: "ok",
      result: { summary: "s", issues: request.reportedIssues.slice() },
    };
    const verdict = verdictFromJev(parseJevResponse(response, request), request);
    expect(resolveCell(record, verdict, {}).decisions).toEqual(verdict.decisions);
  });
});
