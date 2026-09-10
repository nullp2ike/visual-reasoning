import { imagePromptHash } from "../../../bench/visibility/src/ground-truth.js";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dataset } from "../../../bench/src/dataset.js";
import {
  isRecordCurrent,
  loadVisibilityRecords,
  recordPath,
  runsDir,
} from "../../../bench/visibility/src/records.js";
import {
  VisibilityRunRecordSchema,
  type VisibilityImage,
  type VisibilityRunRecord,
} from "../../../bench/visibility/src/types.js";

function tempDataset(): Dataset {
  const root = mkdtempSync(join(tmpdir(), "visibility-results-"));
  return { id: "tmp", dir: join(root, "dataset"), resultsDir: join(root, "results") };
}

const image: VisibilityImage = {
  filename: "a.png",
  sha256: "img-hash",
  visibleCall: ["Title"],
  hiddenCall: ["Gear"],
  elements: ["Gear", "Title"],
  expectedVisible: ["Title"],
  promptHash: "prompt-hash",
};

function makeRecord(partial: Partial<VisibilityRunRecord> = {}): VisibilityRunRecord {
  return {
    schemaVersion: 2,
    model: "model-a",
    provider: "anthropic",
    filename: "a.png",
    imageSha256: "img-hash",
    rep: 1,
    promptHash: "prompt-hash",
    reasoningEffort: "medium",
    imageFidelity: "auto",
    requireCorrectRendering: true,
    maxTokens: 8192,
    timestamp: "2026-09-06T00:00:00.000Z",
    status: "ok",
    calls: [
      {
        mode: "visible",
        elements: ["Title"],
        status: "ok",
        result: {
          pass: true,
          reasoning: "ok",
          statements: [
            {
              statement: 'The element "Title" is fully visible on the page',
              pass: true,
              reasoning: "",
            },
          ],
        },
      },
      {
        mode: "hidden",
        elements: ["Gear"],
        status: "ok",
        result: {
          pass: true,
          reasoning: "ok",
          statements: [
            {
              statement: 'The element "Gear" is NOT visible on the page',
              pass: true,
              reasoning: "",
            },
          ],
        },
      },
    ],
    ...partial,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordPath", () => {
  it("nests runs under the model directory and the image filename", () => {
    const dataset = tempDataset();
    expect(
      recordPath(dataset, { model: "model-a", filename: "a.png", rep: 3 }, "medium", "auto"),
    ).toBe(join(runsDir(dataset), "model-a", "a.png", "rep_3.json"));
  });

  it("keeps non-primary effort and fidelity in separate directories", () => {
    const dataset = tempDataset();
    const path = recordPath(
      dataset,
      { model: "model-a", filename: "a.png", rep: 1 },
      "xhigh",
      "high",
    );
    expect(path).toContain(join("model-a@xhigh@fid-high", "a.png"));
  });

  it("flattens a provider slug that contains a slash", () => {
    const dataset = tempDataset();
    const path = recordPath(
      dataset,
      { model: "x-ai/grok-4.6", filename: "a.png", rep: 1 },
      "medium",
      "auto",
    );
    expect(path).toContain(join("x-ai__grok-4.6", "a.png"));
  });
});

describe("isRecordCurrent", () => {
  it("accepts a record produced from the same image and prompt", () => {
    expect(isRecordCurrent(makeRecord(), image)).toBe(true);
  });

  it("rejects a record whose prompt hash has moved on", () => {
    expect(isRecordCurrent(makeRecord({ promptHash: "other" }), image)).toBe(false);
  });

  it("rejects a record taken against different image bytes", () => {
    expect(isRecordCurrent(makeRecord({ imageSha256: "other" }), image)).toBe(false);
  });
});

describe("loadVisibilityRecords", () => {
  it("returns nothing when no runs exist yet", async () => {
    await expect(loadVisibilityRecords(tempDataset())).resolves.toEqual([]);
  });

  it("walks model and image directories and parses every record", async () => {
    const dataset = tempDataset();
    for (const [model, rep] of [
      ["model-a", 1],
      ["model-a", 2],
      ["model-b", 1],
    ] as const) {
      const path = recordPath(dataset, { model, filename: "a.png", rep }, "medium", "auto");
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, JSON.stringify(makeRecord({ model, rep })), "utf8");
    }
    const records = await loadVisibilityRecords(dataset);
    expect(records).toHaveLength(3);
    expect(new Set(records.map((r) => r.model))).toEqual(new Set(["model-a", "model-b"]));
  });

  it("warns about and skips a record that no longer parses", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const dataset = tempDataset();
    const good = recordPath(
      dataset,
      { model: "model-a", filename: "a.png", rep: 1 },
      "medium",
      "auto",
    );
    mkdirSync(join(good, ".."), { recursive: true });
    writeFileSync(good, JSON.stringify(makeRecord()), "utf8");
    writeFileSync(join(good, "..", "rep_2.json"), JSON.stringify({ nope: true }), "utf8");

    const records = await loadVisibilityRecords(dataset);
    expect(records).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("rep_2.json"));
  });

  it("ignores non-JSON files in a run directory", async () => {
    const dataset = tempDataset();
    const path = recordPath(
      dataset,
      { model: "model-a", filename: "a.png", rep: 1 },
      "medium",
      "auto",
    );
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(makeRecord()), "utf8");
    writeFileSync(join(path, "..", "notes.txt"), "scratch", "utf8");
    await expect(loadVisibilityRecords(dataset)).resolves.toHaveLength(1);
  });
});

describe("rendering-quality axis", () => {
  it("gives presence-only runs their own directory, the default keeping the bare one", () => {
    const dataset = tempDataset();
    const key = { model: "model-a", filename: "a.png", rep: 1 };
    const on = recordPath(dataset, key, "medium", "auto");
    const off = recordPath(dataset, key, "medium", "auto", false);
    expect(on).toContain(join("model-a", "a.png"));
    expect(off).toContain(join("model-a@presence", "a.png"));
    expect(recordPath(dataset, key, "medium", "auto", true)).toBe(on);
  });

  it("keeps a presence-only record current only against the presence-only hash", () => {
    const off = makeRecord({
      requireCorrectRendering: false,
      promptHash: imagePromptHash(image, false),
    });
    expect(isRecordCurrent(off, image)).toBe(true);
    // The same record stamped with the default hash is stale: it ran under the other prompt.
    expect(isRecordCurrent({ ...off, promptHash: image.promptHash }, image)).toBe(false);
  });

  it("treats a record written before the axis existed as the default setting", () => {
    const legacy = { ...makeRecord() } as Record<string, unknown>;
    delete legacy["requireCorrectRendering"];
    const parsed = VisibilityRunRecordSchema.parse(legacy);
    expect(parsed.requireCorrectRendering).toBe(true);
    expect(isRecordCurrent(parsed, image)).toBe(true);
  });
});
