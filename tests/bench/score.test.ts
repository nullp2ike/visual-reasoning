import { describe, expect, it } from "vitest";
import { filterScorableRecords, scoresPathForJudge } from "../../bench/src/score.js";
import type { Manifest, RunRecord } from "../../bench/src/types.js";

function record(model: string, imageId: string): RunRecord {
  return {
    schemaVersion: 1,
    model,
    provider: "anthropic",
    imageId,
    rep: 1,
    promptHash: "hash",
    reasoningEffort: "medium",
    timestamp: "2026-07-23T00:00:00.000Z",
    status: "ok",
    result: { summary: "s", issues: [] },
  };
}

const manifest: Manifest = {
  schemaVersion: 1,
  promptHash: "hash",
  generatedAt: "2026-07-23T00:00:00.000Z",
  entries: [{ imageId: "img_01", filename: "a.png", sha256: "s", expectedIssues: ["x"] }],
  retired: [{ imageId: "img_07", filename: "clean.png", sha256: "s" }],
};

describe("filterScorableRecords", () => {
  it("keeps roster records for active images", () => {
    const { records, skippedModels, skippedImages } = filterScorableRecords(
      [record("model-a", "img_01")],
      manifest,
      ["model-a"],
    );
    expect(records).toHaveLength(1);
    expect(skippedModels.size).toBe(0);
    expect(skippedImages.size).toBe(0);
  });

  it("skips records for retired or unknown images", () => {
    const { records, skippedImages } = filterScorableRecords(
      [record("model-a", "img_01"), record("model-a", "img_07"), record("model-a", "img_99")],
      manifest,
      ["model-a"],
    );
    expect(records).toHaveLength(1);
    expect([...skippedImages].sort((a, b) => a.localeCompare(b))).toEqual(["img_07", "img_99"]);
  });

  it("skips records for models outside the roster", () => {
    const { records, skippedModels } = filterScorableRecords(
      [record("model-a", "img_01"), record("old-model", "img_01")],
      manifest,
      ["model-a"],
    );
    expect(records).toHaveLength(1);
    expect([...skippedModels]).toEqual(["old-model"]);
  });
});

describe("scoresPathForJudge", () => {
  it("embeds the judge model in the filename", () => {
    expect(scoresPathForJudge("claude-haiku-4-5")).toMatch(/scores\.claude-haiku-4-5\.json$/);
  });

  it("sanitizes slash-slug judges", () => {
    expect(scoresPathForJudge("x-ai/grok-4.5")).toMatch(/scores\.x-ai__grok-4\.5\.json$/);
  });
});
