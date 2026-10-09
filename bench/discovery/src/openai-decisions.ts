import { z } from "zod";
import {
  OPENAI_DECISIONS_JUDGE_PREFIX,
  createDecisionsPost,
  expectedKey,
  matchInstructions,
  matchOptions,
  parseJevResponse,
  reportedIssueText,
  reportedKey,
  type JevRequest,
  type JevResponse,
} from "./jev.js";

/**
 * OpenAI's Decisions API as a judge (public beta, `gpt-6-luna` only). It asks
 * Jev's questions with Jev's options, one choice question per reported issue,
 * and its answers are normalised into Jev's response shape so the verdict logic
 * is shared. It differs from OpenRouter's Decisions API in shape only: there is
 * no `state`, so both issue lists go into the `input` text; questions are an
 * array of named entries; and probabilities come back as a `{value, probability}`
 * array. It bills input tokens only.
 *
 * The judge id is `openai-decisions/<model>`: `gpt-6-luna` alone is already the
 * chat judge, and the prefix keeps the two apart in caches and results.
 */

/** Bump when the input layout or question wording changes: it versions this judge's cache entries. */
export const OPENAI_DECISIONS_PROMPT_VERSION = "openai-decisions-v1";

const DECISIONS_URL = "https://api.openai.com/v1/decisions";

export function isOpenAIDecisionsJudge(judgeModel: string): boolean {
  return judgeModel.startsWith(OPENAI_DECISIONS_JUDGE_PREFIX);
}

export interface OpenAIDecisionsRequestBody {
  model: string;
  input: string;
  questions: {
    type: "choice";
    name: string;
    instructions: string;
    choices: { value: string; description: string }[];
  }[];
}

export function buildOpenAIDecisionsRequest(
  request: JevRequest,
  judgeModel: string,
): OpenAIDecisionsRequestBody {
  const expected = request.expectedIssues.map((text, i) => `${expectedKey(i)}: ${text}`);
  const reported = request.reportedIssues.map(
    (issue, j) => `${reportedKey(j)}: ${reportedIssueText(issue)}`,
  );
  const choices = Object.entries(matchOptions(request.expectedIssues)).map(
    ([value, description]) => ({ value, description }),
  );
  return {
    model: judgeModel.slice(OPENAI_DECISIONS_JUDGE_PREFIX.length),
    input: `Expected defects:\n${expected.join("\n")}\n\nReported issues:\n${reported.join("\n")}`,
    questions: request.reportedIssues.map((_, j) => {
      const name = reportedKey(j);
      return {
        type: "choice",
        name,
        instructions: matchInstructions(name, "listed under Reported issues in the input"),
        choices,
      };
    }),
  };
}

const ChoiceAnswerSchema = z.object({
  type: z.literal("choice"),
  name: z.string(),
  choice: z.string(),
  probabilities: z.array(z.object({ value: z.string(), probability: z.number().min(0).max(1) })),
  confidence: z.number().min(0).max(1),
});

const RefusalAnswerSchema = z.object({ type: z.literal("refusal"), name: z.string() });

const OpenAIDecisionsResponseSchema = z.object({
  answers: z.array(z.discriminatedUnion("type", [ChoiceAnswerSchema, RefusalAnswerSchema])),
});

/**
 * Validate a response and normalise it into Jev's keyed shape. A refusal throws:
 * counting it as "none" would quietly turn a non-answer into an extra.
 */
export function parseOpenAIDecisionsResponse(raw: unknown, request: JevRequest): JevResponse {
  const { answers } = OpenAIDecisionsResponseSchema.parse(raw);
  const refused = answers.filter((a) => a.type === "refusal").map((a) => a.name);
  if (refused.length > 0) {
    throw new Error(`OpenAI Decisions refused to answer for ${refused.join(", ")}`);
  }
  const normalised = {
    answers: Object.fromEntries(
      answers.flatMap((a) =>
        a.type === "choice"
          ? [
              [
                a.name,
                {
                  choice: a.choice,
                  probabilities: Object.fromEntries(
                    a.probabilities.map((p) => [p.value, p.probability]),
                  ),
                  confidence: a.confidence,
                },
              ],
            ]
          : [],
      ),
    ),
  };
  return parseJevResponse(normalised, request);
}

/** Posts one OpenAI Decisions request and returns the raw JSON body. Injectable for tests. */
export type OpenAIDecide = (body: OpenAIDecisionsRequestBody) => Promise<unknown>;

export function createOpenAIDecide(): OpenAIDecide {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY: the openai-decisions judge calls OpenAI directly.");
  }
  return createDecisionsPost(DECISIONS_URL, apiKey, "OpenAI");
}
