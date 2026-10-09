import { z } from "zod";
import { retryWithBackoff } from "../../shared/util.js";
import type { JudgeDecision, JudgeVerdict } from "./types.js";

/**
 * Jev (TypeSafe) as a judge. Jev is a decision model, not a chat model: it
 * takes a `state` plus typed questions and returns probabilities, never text.
 * The judgment is asked one reported issue at a time, as a Choice over the
 * expected defects plus "none", which yields every part of a JudgeVerdict:
 * a defect is found when some reported issue picks it, and a reported issue
 * that picks "none" is an extra. There is no prose, so the verdict's reasoning
 * records the probabilities, and each decision keeps Jev's calibrated confidence.
 */

/** Bump when the question wording changes: it versions Jev's judge-cache entries. */
export const JEV_PROMPT_VERSION = "jev-v2";

const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
export const NONE = "none";

/**
 * Judge-id prefix for OpenAI's own Decisions API (see openai-decisions.ts). It
 * only serves `gpt-6-luna`, which is also a chat judge, so the prefix keeps the
 * two apart in judge ids, cache keys and results file names.
 */
export const OPENAI_DECISIONS_JUDGE_PREFIX = "openai-decisions/";

/**
 * Decision judges are TypeSafe models, addressed by id or by the `~typesafe/…`
 * alias, and models behind OpenAI's Decisions API, under `openai-decisions/`.
 */
export function isDecisionJudge(judgeModel: string): boolean {
  return /^~?typesafe\//.test(judgeModel) || judgeModel.startsWith(OPENAI_DECISIONS_JUDGE_PREFIX);
}

export interface JevRequest {
  expectedIssues: readonly string[];
  reportedIssues: readonly { priority: string; category: string; description: string }[];
}

interface JevChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface JevRequestBody {
  model: string;
  state: {
    expected_defects: Record<string, string>;
    reported_issues: Record<string, string>;
  };
  questions: Record<string, JevChoiceQuestion>;
}

export const expectedKey = (i: number): string => `E${i}`;
export const reportedKey = (j: number): string => `R${j}`;

/** The options every question offers, keyed by option id: one per expected defect, plus "none". */
export function matchOptions(expectedIssues: readonly string[]): Record<string, string> {
  const options: Record<string, string> = Object.fromEntries(
    expectedIssues.map((text, i) => [expectedKey(i), `R describes this defect: ${text}`]),
  );
  options[NONE] =
    "R describes a different UI element or a different problem than every expected defect. " +
    "This includes a separate, additional problem in the same area as an expected defect " +
    "(for example another styling flaw on the same card or component), and a report that " +
    "mentions the defect only vaguely.";
  return options;
}

/** The question asked about one reported issue; `where` says where the judge finds it. */
export function matchInstructions(key: string, where: string): string {
  return (
    "Two QA bug reports describe the same app screenshot; nobody sees the screenshot. " +
    `Does reported issue ${key} (${where}) describe the same ` +
    "underlying defect as one of the expected defects: the same UI element or area with " +
    "the same problem? Wording may differ completely; match on meaning."
  );
}

/** A reported issue as the judge sees it. */
export function reportedIssueText(issue: JevRequest["reportedIssues"][number]): string {
  return `[${issue.priority}/${issue.category}] ${issue.description}`;
}

export function buildJevRequest(request: JevRequest, judgeModel: string): JevRequestBody {
  const criteria = matchOptions(request.expectedIssues);
  const questions = Object.fromEntries(
    request.reportedIssues.map((_, j) => {
      const key = reportedKey(j);
      const question: JevChoiceQuestion = {
        type: "choice",
        instructions: matchInstructions(key, `reported_issues.${key} in the state`),
        criteria,
      };
      return [key, question];
    }),
  );

  return {
    model: judgeModel,
    state: {
      expected_defects: Object.fromEntries(
        request.expectedIssues.map((text, i) => [expectedKey(i), text]),
      ),
      reported_issues: Object.fromEntries(
        request.reportedIssues.map((issue, j) => [reportedKey(j), reportedIssueText(issue)]),
      ),
    },
    questions,
  };
}

const JevChoiceAnswerSchema = z.object({
  choice: z.string(),
  probabilities: z.record(z.number().min(0).max(1)),
  confidence: z.number().min(0).max(1),
});

export const JevResponseSchema = z.object({
  answers: z.record(JevChoiceAnswerSchema),
});
export type JevResponse = z.infer<typeof JevResponseSchema>;

/** Validate a Decisions response against the request: one answer per reported issue, over the offered options. */
export function parseJevResponse(raw: unknown, request: JevRequest): JevResponse {
  const response = JevResponseSchema.parse(raw);
  const options = new Set([...request.expectedIssues.map((_, i) => expectedKey(i)), NONE]);
  request.reportedIssues.forEach((_, j) => {
    const answer = response.answers[reportedKey(j)];
    if (!answer) throw new Error(`Jev response has no answer for ${reportedKey(j)}`);
    if (!options.has(answer.choice)) {
      throw new Error(`Jev chose "${answer.choice}" for ${reportedKey(j)}, not an offered option`);
    }
  });
  return response;
}

function expectedIndexOf(choice: string): number | null {
  return choice === NONE ? null : Number(choice.slice(1));
}

const fmt = (p: number): string => p.toFixed(2);

/**
 * Turn per-issue choices into a verdict. `judgeName` labels the reasoning;
 * OpenAI Decisions answers are normalised into the same shape first.
 */
export function verdictFromJev(
  response: JevResponse,
  request: JevRequest,
  judgeName = "Jev",
): JudgeVerdict {
  const decisions: JudgeDecision[] = request.reportedIssues.map((_, j) => {
    const answer = response.answers[reportedKey(j)];
    if (!answer) throw new Error(`Jev response has no answer for ${reportedKey(j)}`);
    return {
      reportedIndex: j,
      expectedIndex: expectedIndexOf(answer.choice),
      probability: answer.probabilities[answer.choice] ?? 0,
      confidence: answer.confidence,
    };
  });

  const expected = request.expectedIssues.map((_, i) => {
    const matches = decisions.filter((d) => d.expectedIndex === i);
    const best = matches.reduce<JudgeDecision | undefined>(
      (a, d) => (a === undefined || d.probability > a.probability ? d : a),
      undefined,
    );
    let reasoning: string;
    if (best) {
      reasoning = `${judgeName} matched R${best.reportedIndex} (p=${fmt(best.probability)}, confidence ${fmt(best.confidence)}).`;
    } else {
      const candidates = request.reportedIssues.map((_, j) => ({
        j,
        p: response.answers[reportedKey(j)]?.probabilities[expectedKey(i)] ?? 0,
      }));
      const closest = candidates.reduce((a, c) => (c.p > a.p ? c : a));
      reasoning = `${judgeName} matched no reported issue; closest was R${closest.j} (p=${fmt(closest.p)}).`;
    }
    return {
      expectedIndex: i,
      found: matches.length > 0,
      matchedReportedIndexes: matches.map((d) => d.reportedIndex),
      reasoning,
    };
  });

  return {
    expected,
    extraReportedIndexes: decisions
      .filter((d) => d.expectedIndex === null)
      .map((d) => d.reportedIndex),
    decisions,
  };
}

/** Posts one Decisions request and returns the raw JSON body. Injectable for tests. */
export type JevDecide = (body: JevRequestBody) => Promise<unknown>;

class DecisionsHttpError extends Error {
  constructor(
    label: string,
    readonly status: number,
    body: string,
  ) {
    super(`${label} decisions request failed: HTTP ${status}: ${body.slice(0, 300)}`);
    this.name = "DecisionsHttpError";
  }
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 524, 529]);

/** POST bodies to a Decisions endpoint, retrying transient failures; `label` names it in errors. */
export function createDecisionsPost(
  url: string,
  apiKey: string,
  label: string,
): (body: object) => Promise<unknown> {
  return (body) =>
    retryWithBackoff(
      async () => {
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new DecisionsHttpError(label, res.status, await res.text());
        return (await res.json()) as unknown;
      },
      {
        maxAttempts: 4,
        isRetryable: (error) =>
          !(error instanceof DecisionsHttpError) || RETRYABLE_STATUS.has(error.status),
      },
    );
}

export function createJevDecide(): JevDecide {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENROUTER_API_KEY: Jev is called through OpenRouter's Decisions API.",
    );
  }
  return createDecisionsPost(DECISIONS_URL, apiKey, "Jev");
}
