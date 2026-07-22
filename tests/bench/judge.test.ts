import { mkdtemp, readdir } from "node:fs/promises";
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
  expectedIssues: ["The word Jackpots is misspelled"],
  reportedIssues: [issue("Typo in header: 'Jacpots'"), issue("Footer link is broken")],
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

  it("retries once with a nudge on malformed output", async () => {
    const cacheDir = await tempCacheDir();
    const completion = vi
      .fn()
      .mockResolvedValueOnce("I think the typo matches expected issue 0.")
      .mockResolvedValueOnce(JSON.stringify(validVerdict));
    const verdict = await judgeRun(request, { completion, cacheDir });
    expect(verdict).toEqual(validVerdict);
    expect(completion).toHaveBeenCalledTimes(2);
    expect(completion.mock.calls[1]?.[1]).toContain("previous response was invalid");
  });

  it("rejects verdicts referencing out-of-range reported indexes", async () => {
    const cacheDir = await tempCacheDir();
    const badVerdict: JudgeVerdict = {
      expected: [{ expectedIndex: 0, found: true, matchedReportedIndexes: [9], reasoning: "?" }],
      extraReportedIndexes: [],
    };
    const completion = vi.fn().mockResolvedValue(JSON.stringify(badVerdict));
    await expect(judgeRun(request, { completion, cacheDir })).rejects.toThrow(/out of range/);
    expect(completion).toHaveBeenCalledTimes(2); // initial + nudge, both invalid
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

  it("numbers issues in the user prompt", () => {
    const prompt = buildJudgeUserPrompt(request);
    expect(prompt).toContain("0. The word Jackpots is misspelled");
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
