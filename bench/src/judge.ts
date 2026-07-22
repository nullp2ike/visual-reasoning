import { join } from "node:path";
import type { Issue } from "../../src/types.js";
import { benchConfig } from "../bench.config.js";
import { JudgeCacheEntrySchema, JudgeVerdictSchema, type JudgeVerdict } from "./types.js";
import { RESULTS_DIR, atomicWriteJson, readJsonIfExists, sha256 } from "./util.js";

export const JUDGE_CACHE_DIR = join(RESULTS_DIR, "judge-cache");

/** Bump when the judge prompt changes — invalidates the cache. */
export const JUDGE_PROMPT_VERSION = "v1";

const JUDGE_SYSTEM_PROMPT = `You compare QA bug reports for the same app screenshot. You never see the screenshot itself — judge purely from the issue descriptions.

For each EXPECTED defect, decide whether any REPORTED issue describes the same underlying defect: the same UI element (or area) with the same problem. Wording may differ completely; match on meaning. A reported issue that mentions the defect only vaguely or describes a different element/problem is NOT a match.

Then list the indexes of reported issues that match none of the expected defects (extras).

Respond with ONLY a JSON object, no prose, in exactly this shape:
{
  "expected": [
    { "expectedIndex": 0, "found": true, "matchedReportedIndexes": [1], "reasoning": "..." }
  ],
  "extraReportedIndexes": [0, 2]
}
Include one entry per expected defect, in order. "reasoning" is one short sentence.`;

export interface JudgeRequest {
  expectedIssues: readonly string[];
  reportedIssues: readonly Issue[];
}

/** Minimal completion interface so tests can mock the Anthropic call. */
export type JudgeCompletion = (system: string, user: string) => Promise<string>;

export function buildJudgeUserPrompt(request: JudgeRequest): string {
  const expected = request.expectedIssues.map((text, i) => `${i}. ${text}`).join("\n");
  const reported = request.reportedIssues
    .map((issue, i) => `${i}. [${issue.priority}/${issue.category}] ${issue.description}`)
    .join("\n");
  return `EXPECTED defects:\n${expected}\n\nREPORTED issues:\n${reported}`;
}

export function judgeCacheKey(request: JudgeRequest, judgeModel: string): string {
  return sha256(
    JSON.stringify({
      judgeModel,
      version: JUDGE_PROMPT_VERSION,
      expected: request.expectedIssues,
      reported: request.reportedIssues.map((i) => i.description),
    }),
  );
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start)
    throw new Error(`Judge returned no JSON object: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

function validateVerdict(raw: unknown, request: JudgeRequest): JudgeVerdict {
  const verdict = JudgeVerdictSchema.parse(raw);
  if (verdict.expected.length !== request.expectedIssues.length) {
    throw new Error(
      `Judge verdict covers ${verdict.expected.length} expected issues, dataset has ${request.expectedIssues.length}`,
    );
  }
  const reportedCount = request.reportedIssues.length;
  for (const entry of verdict.expected) {
    if (entry.matchedReportedIndexes.some((i) => i >= reportedCount)) {
      throw new Error(`Judge referenced a reported index out of range (${reportedCount} reported)`);
    }
  }
  if (verdict.extraReportedIndexes.some((i) => i >= reportedCount)) {
    throw new Error(`Judge extras referenced an index out of range (${reportedCount} reported)`);
  }
  return verdict;
}

/**
 * Verdicts that need no model call:
 * - nothing reported -> every expected defect missed, no extras
 * - nothing expected -> every reported issue is an extra
 */
export function trivialVerdict(request: JudgeRequest): JudgeVerdict | undefined {
  if (request.reportedIssues.length === 0) {
    return {
      expected: request.expectedIssues.map((_, i) => ({
        expectedIndex: i,
        found: false,
        matchedReportedIndexes: [],
        reasoning: "No issues were reported.",
      })),
      extraReportedIndexes: [],
    };
  }
  if (request.expectedIssues.length === 0) {
    return {
      expected: [],
      extraReportedIndexes: request.reportedIssues.map((_, i) => i),
    };
  }
  return undefined;
}

async function createAnthropicCompletion(): Promise<JudgeCompletion> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  return async (system, user) => {
    const response = await client.messages.create({
      model: benchConfig.judgeModel,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    });
    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
  };
}

export interface JudgeOptions {
  completion?: JudgeCompletion;
  cacheDir?: string;
}

/**
 * Resolve a verdict for one run: trivial short-circuit, then cache, then the judge model
 * (with one retry nudge on malformed JSON). Verdicts are cached on disk keyed by content,
 * so re-scoring never re-calls the judge.
 */
export async function judgeRun(
  request: JudgeRequest,
  options: JudgeOptions = {},
): Promise<JudgeVerdict> {
  const trivial = trivialVerdict(request);
  if (trivial) return trivial;

  const cacheDir = options.cacheDir ?? JUDGE_CACHE_DIR;
  const key = judgeCacheKey(request, benchConfig.judgeModel);
  const cachePath = join(cacheDir, `${key}.json`);
  const cachedRaw = await readJsonIfExists(cachePath);
  if (cachedRaw !== undefined) {
    const cached = JudgeCacheEntrySchema.safeParse(cachedRaw);
    if (cached.success) return cached.data.verdict;
  }

  const completion = options.completion ?? (await createAnthropicCompletion());
  const userPrompt = buildJudgeUserPrompt(request);

  let verdict: JudgeVerdict;
  try {
    verdict = validateVerdict(
      extractJson(await completion(JUDGE_SYSTEM_PROMPT, userPrompt)),
      request,
    );
  } catch {
    const nudged = await completion(
      JUDGE_SYSTEM_PROMPT,
      `${userPrompt}\n\nYour previous response was invalid. Respond with ONLY the JSON object in the required shape.`,
    );
    verdict = validateVerdict(extractJson(nudged), request);
  }

  await atomicWriteJson(cachePath, {
    judgeModel: benchConfig.judgeModel,
    judgePromptVersion: JUDGE_PROMPT_VERSION,
    expectedIssues: request.expectedIssues,
    reportedIssues: request.reportedIssues.map((i) => i.description),
    verdict,
  });
  return verdict;
}
