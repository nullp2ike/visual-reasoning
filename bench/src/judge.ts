import { join } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { AnthropicDriver } from "../../src/providers/anthropic.js";
import { GoogleDriver } from "../../src/providers/google.js";
import { OpenAIDriver } from "../../src/providers/openai.js";
import { OpenRouterDriver } from "../../src/providers/openrouter.js";
import type { ProviderDriver, SendMessageOptions } from "../../src/providers/types.js";
import type { Issue } from "../../src/types.js";
import { benchConfig } from "../bench.config.js";
import {
  EMBED_DEFAULT_THRESHOLD,
  type EmbedFn,
  embedModelRepo,
  embeddingVerdict,
  isEmbeddingJudge,
  loadEmbedder,
} from "./embed.js";
import { JudgeCacheEntrySchema, JudgeVerdictSchema, type JudgeVerdict } from "./types.js";
import { resultsDir, atomicWriteJson, inferProvider, readJsonIfExists, sha256 } from "./util.js";

export function judgeCacheDir(): string {
  return join(resultsDir(), "judge-cache");
}

/**
 * Bump when the judge prompt changes — invalidates the cache.
 * Note: v1 verdicts were produced with the system/user split of the Anthropic-only
 * judge; the provider-agnostic judge concatenates the identical text into one user
 * message. Kept at v1 deliberately to preserve the existing paid cache.
 */
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

/** Minimal completion interface so tests can mock the judge model call. */
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
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice) as unknown;
  } catch {
    // Some judges (e.g. Kimi via OpenRouter) emit raw control characters inside
    // string literals, which strict JSON.parse rejects. Replacing every control
    // character with a space is safe: between tokens it is plain whitespace, and
    // inside strings it preserves the readable text.
    // eslint-disable-next-line no-control-regex
    return JSON.parse(slice.replace(/[\u0000-\u001f]/g, " ")) as unknown;
  }
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

// Generous budget: thinking judges (e.g. Kimi K2.7) spend reasoning tokens from
// the same output allowance; 8192 still truncated when judging verbose reports.
const JUDGE_MAX_TOKENS = 16384;

/**
 * Build a text-only completion for any supported judge model by reusing the
 * library's provider drivers with an empty image list. Drivers lazy-load their
 * SDKs and throw typed auth errors, so misconfiguration fails loudly per call.
 */
export function createJudgeCompletion(judgeModel: string): JudgeCompletion {
  const provider = inferProvider(judgeModel);
  const config = { apiKey: undefined, model: judgeModel, maxTokens: JUDGE_MAX_TOKENS };
  const driver: ProviderDriver =
    provider === "anthropic"
      ? new AnthropicDriver(config)
      : provider === "openai"
        ? new OpenAIDriver(config)
        : provider === "google"
          ? new GoogleDriver(config)
          : new OpenRouterDriver(config);

  // Strict schema only where natively supported (OpenAI Responses API). OpenRouter
  // upstream support varies per routed model and a rejection is a hard 400, so it
  // relies on the JSON-only prompt plus the parse-retry nudge like Anthropic/Google.
  const options: SendMessageOptions | undefined =
    provider === "openai"
      ? {
          responseSchema: zodToJsonSchema(JudgeVerdictSchema, { target: "openAi" }) as Record<
            string,
            unknown
          >,
        }
      : undefined;

  return async (system, user) => {
    const response = await driver.sendMessage([], `${system}\n\n${user}`, options);
    return response.text;
  };
}

export interface JudgeOptions {
  completion?: JudgeCompletion;
  /** Embedding function for `embed:<id>` judges. Injectable so tests avoid loading a model. */
  embed?: EmbedFn;
  /** Cosine threshold for embedding judges. Defaults to EMBED_DEFAULT_THRESHOLD. */
  threshold?: number;
  cacheDir?: string;
  /** Judge model to attribute (and cache) verdicts under. Defaults to benchConfig.judgeModel. */
  judgeModel?: string;
}

/**
 * Resolve a verdict from a local embedding judge: match reported issues to
 * expected ones by cosine similarity. No API call, no retry loop — embeddings are
 * deterministic, so the JSON-repair machinery the LLM path needs does not apply.
 */
async function embeddingJudge(
  request: JudgeRequest,
  judgeModel: string,
  options: JudgeOptions,
): Promise<JudgeVerdict> {
  const embed = options.embed ?? (await loadEmbedder(embedModelRepo(judgeModel)));
  const threshold = options.threshold ?? EMBED_DEFAULT_THRESHOLD;
  return embeddingVerdict(request, embed, threshold);
}

/**
 * Resolve a verdict from an LLM judge: call the model (JSON-only prompt), parse,
 * validate, and retry with an error-echoing nudge on malformed output.
 */
async function llmJudge(
  request: JudgeRequest,
  judgeModel: string,
  options: JudgeOptions,
): Promise<JudgeVerdict> {
  const completion = options.completion ?? createJudgeCompletion(judgeModel);
  const userPrompt = buildJudgeUserPrompt(request);

  // Initial attempt plus two nudges; each nudge echoes the concrete validation
  // error so weaker JSON emitters (e.g. Kimi) know exactly what to fix.
  const maxAttempts = 3;
  let verdict: JudgeVerdict | undefined;
  let prompt = userPrompt;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      verdict = validateVerdict(
        extractJson(await completion(JUDGE_SYSTEM_PROMPT, prompt)),
        request,
      );
      break;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const detail = err instanceof Error ? err.message.slice(0, 500) : String(err);
      prompt = `${userPrompt}\n\nYour previous response was invalid: ${detail}\nRespond with ONLY the JSON object in the required shape.`;
    }
  }
  if (!verdict) throw new Error("Internal: judge retry loop exited without a verdict");
  return verdict;
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

  const judgeModel = options.judgeModel ?? benchConfig.judgeModel;
  const cacheDir = options.cacheDir ?? judgeCacheDir();
  const key = judgeCacheKey(request, judgeModel);
  const cachePath = join(cacheDir, `${key}.json`);
  const cachedRaw = await readJsonIfExists(cachePath);
  if (cachedRaw !== undefined) {
    const cached = JudgeCacheEntrySchema.safeParse(cachedRaw);
    if (cached.success) return cached.data.verdict;
  }

  const verdict = isEmbeddingJudge(judgeModel)
    ? await embeddingJudge(request, judgeModel, options)
    : await llmJudge(request, judgeModel, options);

  await atomicWriteJson(cachePath, {
    judgeModel,
    judgePromptVersion: JUDGE_PROMPT_VERSION,
    expectedIssues: request.expectedIssues,
    reportedIssues: request.reportedIssues.map((i) => i.description),
    verdict,
  });
  return verdict;
}
