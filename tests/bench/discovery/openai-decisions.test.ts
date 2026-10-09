import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildJevRequest, isDecisionJudge } from "../../../bench/discovery/src/jev.js";
import {
  OPENAI_DECISIONS_PROMPT_VERSION,
  buildOpenAIDecisionsRequest,
  isOpenAIDecisionsJudge,
  parseOpenAIDecisionsResponse,
} from "../../../bench/discovery/src/openai-decisions.js";
import {
  judgeCacheKey,
  judgePromptVersion,
  judgeRun,
  type JudgeRequest,
} from "../../../bench/discovery/src/judge.js";
import type { Issue } from "../../../src/types.js";

const JUDGE = "openai-decisions/gpt-6-luna";

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

function answer(name: string, choice: string, pChoice: number, confidence: number) {
  return {
    type: "choice",
    name,
    choice,
    probabilities: ["E0", "none"].map((value) => ({
      value,
      probability: value === choice ? pChoice : 1 - pChoice,
    })),
    confidence,
  };
}

const response = {
  model: "gpt-6-luna",
  answers: [answer("R0", "E0", 0.97, 0.94), answer("R1", "none", 0.88, 0.76)],
  usage: { input_tokens: 340, output_tokens: 0, total_tokens: 340 },
};

describe("isOpenAIDecisionsJudge", () => {
  it("recognises the openai-decisions/ prefix as a decision judge", () => {
    expect(isOpenAIDecisionsJudge(JUDGE)).toBe(true);
    expect(isDecisionJudge(JUDGE)).toBe(true);
  });

  it("keeps the gpt-6-luna chat judge a chat judge", () => {
    expect(isOpenAIDecisionsJudge("gpt-6-luna")).toBe(false);
    expect(isDecisionJudge("gpt-6-luna")).toBe(false);
    expect(isOpenAIDecisionsJudge("typesafe/jev-1.13")).toBe(false);
  });
});

describe("buildOpenAIDecisionsRequest", () => {
  const body = buildOpenAIDecisionsRequest(request, JUDGE);

  it("sends the bare model id, without the judge prefix", () => {
    expect(body.model).toBe("gpt-6-luna");
  });

  it("puts both issue lists in the input text, since there is no state field", () => {
    expect(body.input).toContain("E0: Discount badge shows −0%");
    expect(body.input).toContain("R0: [major/content] The pizza card shows a −0% discount badge");
    expect(body.input).toContain("R1: [major/content] The heart button");
  });

  it("asks one named choice question per reported issue, with Jev's options", () => {
    expect(body.questions.map((q) => q.name)).toEqual(["R0", "R1"]);
    const jev = buildJevRequest(request, "typesafe/jev-1.13");
    for (const question of body.questions) {
      expect(question.type).toBe("choice");
      expect(question.instructions).toContain(question.name);
      expect(question.choices).toEqual(
        Object.entries(jev.questions.R0?.criteria ?? {}).map(([value, description]) => ({
          value,
          description,
        })),
      );
    }
  });
});

describe("parseOpenAIDecisionsResponse", () => {
  it("normalises the answers array into Jev's keyed shape", () => {
    const parsed = parseOpenAIDecisionsResponse(response, request);
    expect(parsed.answers.R0).toEqual({
      choice: "E0",
      probabilities: { E0: 0.97, none: expect.closeTo(0.03, 10) as number },
      confidence: 0.94,
    });
    expect(parsed.answers.R1?.choice).toBe("none");
  });

  it("throws on a refusal rather than counting the issue as unmatched", () => {
    const refused = {
      ...response,
      answers: [answer("R0", "E0", 0.97, 0.94), { type: "refusal", name: "R1" }],
    };
    expect(() => parseOpenAIDecisionsResponse(refused, request)).toThrow(/refused.*R1/);
  });

  it("throws when a reported issue has no answer", () => {
    const missing = { ...response, answers: [answer("R0", "E0", 0.97, 0.94)] };
    expect(() => parseOpenAIDecisionsResponse(missing, request)).toThrow(/R1/);
  });

  it("throws when the choice is not an offered option", () => {
    const bad = { ...response, answers: [answer("R0", "E7", 0.9, 0.9), response.answers[1]] };
    expect(() => parseOpenAIDecisionsResponse(bad, request)).toThrow(/E7/);
  });
});

describe("judgeRun with the OpenAI Decisions judge", () => {
  it("routes through the decisions call, names the judge, and caches under its own version", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "bench-openai-decisions-"));
    const decide = vi.fn().mockResolvedValue(response);
    const completion = vi.fn();
    const options = { judgeModel: JUDGE, cacheDir, decide, completion };

    const verdict = await judgeRun(request, options);
    await judgeRun(request, options);

    expect(decide).toHaveBeenCalledTimes(1);
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-6-luna" }));
    expect(completion).not.toHaveBeenCalled();
    expect(verdict.expected[0]?.found).toBe(true);
    expect(verdict.expected[0]?.reasoning).toBe(
      "OpenAI Decisions matched R0 (p=0.97, confidence 0.94).",
    );
    expect(verdict.extraReportedIndexes).toEqual([1]);
    expect(verdict.decisions?.[1]?.confidence).toBe(0.76);

    const [file] = await readdir(cacheDir);
    const entry = JSON.parse(await readFile(join(cacheDir, file ?? ""), "utf8")) as {
      judgePromptVersion: string;
    };
    expect(entry.judgePromptVersion).toBe(OPENAI_DECISIONS_PROMPT_VERSION);
  });

  it("never shares cache entries with the gpt-6-luna chat judge", () => {
    expect(judgePromptVersion(JUDGE)).toBe(OPENAI_DECISIONS_PROMPT_VERSION);
    expect(judgeCacheKey(request, JUDGE)).not.toBe(judgeCacheKey(request, "gpt-6-luna"));
  });
});
