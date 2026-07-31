import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  cosine,
  embedModelRepo,
  embeddingVerdict,
  isEmbeddingJudge,
  type EmbedFn,
} from "../../bench/src/embed.js";
import { judgeRun, type JudgeRequest } from "../../bench/src/judge.js";
import type { Issue } from "../../src/types.js";

function issue(description: string): Issue {
  return { priority: "major", category: "content", description, suggestion: "fix it" };
}

// Deterministic 3-D vectors. Similar meanings share a direction; cosine()
// normalizes, so the raw magnitudes need not be unit length. Unknown strings map
// to the zero vector (cosine 0 with everything => never a match).
const VECTORS: Record<string, number[]> = {
  "The balance shows a negative value": [1, 0, 0],
  "Header balance is negative": [0.98, 0.2, 0], // ~0.98 cosine to the expected typo
  "The account balance went below zero": [0.95, 0.3, 0], // also close to the typo
  "Footer link is broken": [0, 0, 1], // orthogonal -> no match
};

const fakeEmbed: EmbedFn = (texts) => Promise.resolve(texts.map((t) => VECTORS[t] ?? [0, 0, 0]));

const request: JudgeRequest = {
  expectedIssues: ["The balance shows a negative value"],
  reportedIssues: [issue("Header balance is negative"), issue("Footer link is broken")],
};

async function tempCacheDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "bench-embed-"));
}

describe("embedding helpers", () => {
  it("recognizes embed:<id> judge ids and resolves their repos", () => {
    expect(isEmbeddingJudge("embed:bge-small")).toBe(true);
    expect(isEmbeddingJudge("claude-haiku-4-5")).toBe(false);
    expect(embedModelRepo("embed:bge-small")).toBe("Xenova/bge-small-en-v1.5");
    expect(() => embedModelRepo("embed:nope")).toThrow(/Unknown embedding judge/);
  });

  it("computes cosine similarity and guards zero vectors", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1); // magnitude-invariant
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("embeddingVerdict", () => {
  it("matches a reported issue above the threshold and flags the rest as extras", async () => {
    const verdict = await embeddingVerdict(request, fakeEmbed, 0.75);
    expect(verdict.expected[0]?.found).toBe(true);
    expect(verdict.expected[0]?.matchedReportedIndexes).toEqual([0]);
    expect(verdict.expected[0]?.reasoning).toContain(">=");
    expect(verdict.extraReportedIndexes).toEqual([1]);
  });

  it("reports not-found when nothing clears the threshold", async () => {
    const verdict = await embeddingVerdict(
      {
        expectedIssues: ["The balance shows a negative value"],
        reportedIssues: [issue("Footer link is broken")],
      },
      fakeEmbed,
      0.75,
    );
    expect(verdict.expected[0]?.found).toBe(false);
    expect(verdict.expected[0]?.matchedReportedIndexes).toEqual([]);
    expect(verdict.expected[0]?.reasoning).toContain("<");
    expect(verdict.extraReportedIndexes).toEqual([0]);
  });

  it("matches every reported issue above the threshold", async () => {
    const verdict = await embeddingVerdict(
      {
        expectedIssues: ["The balance shows a negative value"],
        reportedIssues: [issue("Header balance is negative"), issue("The account balance went below zero")],
      },
      fakeEmbed,
      0.75,
    );
    expect(verdict.expected[0]?.matchedReportedIndexes).toEqual([0, 1]);
    expect(verdict.extraReportedIndexes).toEqual([]);
  });

  it("marks every reported issue extra when nothing is expected", async () => {
    const verdict = await embeddingVerdict(
      { expectedIssues: [], reportedIssues: [issue("Footer link is broken")] },
      fakeEmbed,
      0.75,
    );
    expect(verdict.expected).toEqual([]);
    expect(verdict.extraReportedIndexes).toEqual([0]);
  });

  it("respects a higher threshold", async () => {
    // 0.98 cosine passes at 0.75 but fails at 0.99.
    const verdict = await embeddingVerdict(request, fakeEmbed, 0.99);
    expect(verdict.expected[0]?.found).toBe(false);
    expect(verdict.extraReportedIndexes).toEqual([0, 1]);
  });
});

describe("judgeRun with an embedding judge", () => {
  it("produces a verdict via the injected embedder and caches it under the judge id", async () => {
    const cacheDir = await tempCacheDir();
    const embed = vi.fn(fakeEmbed);
    const verdict = await judgeRun(request, {
      judgeModel: "embed:bge-small",
      embed,
      threshold: 0.75,
      cacheDir,
    });
    expect(verdict.expected[0]?.found).toBe(true);
    expect(embed).toHaveBeenCalledTimes(1);

    const files = await readdir(cacheDir);
    expect(files).toHaveLength(1);
    const entry = JSON.parse(await readFile(join(cacheDir, files[0] ?? ""), "utf8")) as {
      judgeModel: string;
    };
    expect(entry.judgeModel).toBe("embed:bge-small");

    // Second call is served from cache without re-embedding.
    const verdict2 = await judgeRun(request, {
      judgeModel: "embed:bge-small",
      embed,
      threshold: 0.75,
      cacheDir,
    });
    expect(verdict2).toEqual(verdict);
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it("short-circuits with no embedding call when nothing was reported", async () => {
    const cacheDir = await tempCacheDir();
    const embed = vi.fn(fakeEmbed);
    const verdict = await judgeRun(
      { expectedIssues: ["a"], reportedIssues: [] },
      { judgeModel: "embed:bge-small", embed, cacheDir },
    );
    expect(verdict.expected[0]?.found).toBe(false);
    expect(embed).not.toHaveBeenCalled();
  });
});
