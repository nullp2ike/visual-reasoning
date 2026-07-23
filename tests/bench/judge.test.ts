import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildJudgeUserPrompt,
  judgeCacheKey,
  judgeRun,
  trivialVerdict,
  type JudgeRequest,
} from "../../bench/src/judge.js";
import { resolveCell } from "../../bench/src/score.js";
import type { JudgeVerdict, RunRecord } from "../../bench/src/types.js";
import type { Issue } from "../../src/types.js";

function issue(description: string): Issue {
  return { priority: "major", category: "content", description, suggestion: "fix it" };
}

const request: JudgeRequest = {
  expectedIssues: ["The balance shows a negative value"],
  reportedIssues: [issue("Header balance is negative"), issue("Footer link is broken")],
};

const validVerdict: JudgeVerdict = {
  expected: [
    { expectedIndex: 0, found: true, matchedReportedIndexes: [0], reasoning: "Same typo." },
  ],
  extraReportedIndexes: [1],
};

async function tempCacheDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "bench-judge-"));
}

describe("trivialVerdict", () => {
  it("marks everything missed when nothing was reported", () => {
    const verdict = trivialVerdict({ expectedIssues: ["a", "b"], reportedIssues: [] });
    expect(verdict).toBeDefined();
    expect(verdict?.expected.map((e) => e.found)).toEqual([false, false]);
    expect(verdict?.extraReportedIndexes).toEqual([]);
  });

  it("marks everything extra when nothing was expected", () => {
    const verdict = trivialVerdict({
      expectedIssues: [],
      reportedIssues: [issue("x"), issue("y")],
    });
    expect(verdict?.expected).toEqual([]);
    expect(verdict?.extraReportedIndexes).toEqual([0, 1]);
  });

  it("returns undefined when a real judgment is needed", () => {
    expect(trivialVerdict(request)).toBeUndefined();
  });
});

describe("judgeRun", () => {
  it("parses a valid judge response and caches it", async () => {
    const cacheDir = await tempCacheDir();
    const completion = vi.fn().mockResolvedValue(JSON.stringify(validVerdict));
    const verdict = await judgeRun(request, { completion, cacheDir });
    expect(verdict).toEqual(validVerdict);
    expect(completion).toHaveBeenCalledTimes(1);
    expect(await readdir(cacheDir)).toHaveLength(1);

    // Second call is served from cache without touching the model.
    const verdict2 = await judgeRun(request, { completion, cacheDir });
    expect(verdict2).toEqual(validVerdict);
    expect(completion).toHaveBeenCalledTimes(1);
  });

  it("accepts JSON containing raw control characters inside strings", async () => {
    // Some judges (e.g. Kimi via OpenRouter) emit literal newlines/tabs inside
    // string literals, which strict JSON.parse rejects.
    const cacheDir = await tempCacheDir();
    const dirty = JSON.stringify(validVerdict).replace('"Same typo."', '"Same\ntypo:\tmatch."');
    const completion = vi.fn().mockResolvedValue(dirty);
    const verdict = await judgeRun(request, { completion, cacheDir });
    expect(verdict.expected[0]?.found).toBe(true);
    expect(verdict.expected[0]?.reasoning).toBe("Same typo: match.");
    expect(completion).toHaveBeenCalledTimes(1);
  });

  it("retries with a nudge carrying the validation error on malformed output", async () => {
    const cacheDir = await tempCacheDir();
    const completion = vi
      .fn()
      .mockResolvedValueOnce('{"expected": "the typo matches", "extraReportedIndexes": []}')
      .mockResolvedValueOnce(JSON.stringify(validVerdict));
    const verdict = await judgeRun(request, { completion, cacheDir });
    expect(verdict).toEqual(validVerdict);
    expect(completion).toHaveBeenCalledTimes(2);
    const nudge = completion.mock.calls[1]?.[1] as string;
    expect(nudge).toContain("previous response was invalid");
    expect(nudge).toContain("expected"); // the specific validation error is echoed back
  });

  it("recovers on the second nudge", async () => {
    const cacheDir = await tempCacheDir();
    const completion = vi
      .fn()
      .mockResolvedValueOnce("no json at all")
      .mockResolvedValueOnce("still no json")
      .mockResolvedValueOnce(JSON.stringify(validVerdict));
    const verdict = await judgeRun(request, { completion, cacheDir });
    expect(verdict).toEqual(validVerdict);
    expect(completion).toHaveBeenCalledTimes(3);
  });

  it("rejects verdicts referencing out-of-range reported indexes", async () => {
    const cacheDir = await tempCacheDir();
    const badVerdict: JudgeVerdict = {
      expected: [{ expectedIndex: 0, found: true, matchedReportedIndexes: [9], reasoning: "?" }],
      extraReportedIndexes: [],
    };
    const completion = vi.fn().mockResolvedValue(JSON.stringify(badVerdict));
    await expect(judgeRun(request, { completion, cacheDir })).rejects.toThrow(/out of range/);
    expect(completion).toHaveBeenCalledTimes(3); // initial + two nudges, all invalid
  });

  it("short-circuits without an API call when nothing was reported", async () => {
    const cacheDir = await tempCacheDir();
    const completion = vi.fn();
    const verdict = await judgeRun(
      { expectedIssues: ["a"], reportedIssues: [] },
      { completion, cacheDir },
    );
    expect(verdict.expected[0]?.found).toBe(false);
    expect(completion).not.toHaveBeenCalled();
  });

  it("uses distinct cache keys for distinct inputs", () => {
    const keyA = judgeCacheKey(request, "judge-model");
    const keyB = judgeCacheKey({ ...request, expectedIssues: ["other"] }, "judge-model");
    expect(keyA).not.toBe(keyB);
  });

  it("uses distinct cache keys for distinct judge models", () => {
    expect(judgeCacheKey(request, "claude-haiku-4-5")).not.toBe(
      judgeCacheKey(request, "gpt-5.4-mini"),
    );
  });

  it("caches per judge model and records the judge in the cache entry", async () => {
    const cacheDir = await tempCacheDir();
    const completion = vi.fn().mockResolvedValue(JSON.stringify(validVerdict));

    await judgeRun(request, { completion, cacheDir, judgeModel: "judge-a" });
    await judgeRun(request, { completion, cacheDir, judgeModel: "judge-b" });
    // Same request under a different judge is a cache miss -> second call.
    expect(completion).toHaveBeenCalledTimes(2);

    const files = await readdir(cacheDir);
    expect(files).toHaveLength(2);
    const entries = await Promise.all(
      files.map(async (f) => JSON.parse(await readFile(join(cacheDir, f), "utf8")) as unknown),
    );
    const judgeModels = entries
      .map((e) => (e as { judgeModel: string }).judgeModel)
      .sort((a, b) => a.localeCompare(b));
    expect(judgeModels).toEqual(["judge-a", "judge-b"]);

    // Re-running either judge hits its own cache.
    await judgeRun(request, { completion, cacheDir, judgeModel: "judge-a" });
    expect(completion).toHaveBeenCalledTimes(2);
  });

  it("numbers issues in the user prompt", () => {
    const prompt = buildJudgeUserPrompt(request);
    expect(prompt).toContain("0. The balance shows a negative value");
    expect(prompt).toContain("1. [major/content] Footer link is broken");
  });
});

describe("resolveCell override merge", () => {
  const record: RunRecord = {
    schemaVersion: 1,
    model: "model-x",
    provider: "anthropic",
    imageId: "img_01",
    rep: 1,
    promptHash: "hash",
    reasoningEffort: "medium",
    timestamp: "2026-07-22T00:00:00.000Z",
    status: "ok",
    result: { summary: "sum", issues: request.reportedIssues as Issue[] },
  };

  it("keeps judge verdicts when no override applies", () => {
    const cell = resolveCell(record, validVerdict, {});
    expect(cell.expected[0]?.found).toBe(true);
    expect(cell.extraReportedIndexes).toEqual([1]);
    expect(cell.overridden).toBe(false);
  });

  it("applies expected-issue and extras overrides and flags the cell", () => {
    const cell = resolveCell(record, validVerdict, {
      "model-x/img_01/rep_1": { expected: { "0": "missed" }, extras: { "1": "not-extra" } },
    });
    expect(cell.expected[0]?.found).toBe(false);
    expect(cell.expected[0]?.overridden).toBe(true);
    expect(cell.extraReportedIndexes).toEqual([]);
    expect(cell.overridden).toBe(true);
  });

  it("treats an override matching the judge verdict as a no-op", () => {
    const cell = resolveCell(record, validVerdict, {
      "model-x/img_01/rep_1": { expected: { "0": "found" } },
    });
    expect(cell.expected[0]?.overridden).toBe(false);
    expect(cell.overridden).toBe(false);
  });

  it("ignores overrides for other cells and out-of-range extras", () => {
    const cell = resolveCell(record, validVerdict, {
      "model-x/img_01/rep_2": { expected: { "0": "missed" } },
      "model-x/img_01/rep_1": { extras: { "42": "extra" } },
    });
    expect(cell.expected[0]?.found).toBe(true);
    expect(cell.extraReportedIndexes).toEqual([1]);
    expect(cell.overridden).toBe(false);
  });

  it("resolves error records without a verdict", () => {
    const errorRecord: RunRecord = {
      ...record,
      status: "error",
      result: undefined,
      error: { name: "VisualAIProviderError", message: "boom", attempts: 3 },
    };
    const cell = resolveCell(errorRecord, undefined, {});
    expect(cell.status).toBe("error");
    expect(cell.expected).toEqual([]);
    expect(cell.reportedIssues).toEqual([]);
    expect(cell.error?.message).toBe("boom");
  });
});
