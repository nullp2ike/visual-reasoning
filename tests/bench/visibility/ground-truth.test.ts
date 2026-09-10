import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VISIBILITY_FILE,
  type ParsedElement,
  listVisibilityDatasetIds,
  loadVisibilityGroundTruth,
  parseVisibilityMarkdown,
  resolveVisibilityDataset,
  sortedElements,
  imagePromptHash,
  visibilityPromptHash,
  visibilityResultsDir,
} from "../../../bench/visibility/src/ground-truth.js";
import { visibilityBenchConfig } from "../../../bench/visibility/visibility.config.js";
import { datasetFrom } from "../../../bench/src/dataset.js";
import { sha256 } from "../../../bench/src/util.js";

const SAMPLE = `# Element visibility per image

Prose before the first heading is ignored.

## a.png

### visible

- The "Orbit" title
- A search bar

### absent

- A settings gear icon

## b.png

### absent

- A cookie banner
`;

function tempDataset(markdown: string, files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "visibility-dataset-"));
  writeFileSync(join(dir, VISIBILITY_FILE), markdown, "utf8");
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(dir, name), contents, "utf8");
  }
  return dir;
}

describe("parseVisibilityMarkdown", () => {
  it("parses visible and absent elements per image", () => {
    const parsed = parseVisibilityMarkdown(SAMPLE);
    expect([...parsed.keys()]).toEqual(["a.png", "b.png"]);
    expect(parsed.get("a.png")).toEqual([
      { element: 'The "Orbit" title', askedAs: "visible", expectedVisible: true },
      { element: "A search bar", askedAs: "visible", expectedVisible: true },
      { element: "A settings gear icon", askedAs: "hidden", expectedVisible: false },
    ]);
  });

  it("treats a missing section as an empty list", () => {
    const parsed = parseVisibilityMarkdown(SAMPLE);
    expect(parsed.get("b.png")).toEqual([
      { element: "A cookie banner", askedAs: "hidden", expectedVisible: false },
    ]);
  });

  it("accepts sub-headings in any case", () => {
    const parsed = parseVisibilityMarkdown("## a.png\n\n### Visible\n\n- Title\n");
    expect(parsed.get("a.png")?.[0]?.expectedVisible).toBe(true);
  });

  it("ignores empty bullets left over from the screenshot bench's negative-control style", () => {
    const parsed = parseVisibilityMarkdown("## a.png\n\n### visible\n\n-\n- Title\n");
    expect(parsed.get("a.png")).toEqual([
      { element: "Title", askedAs: "visible", expectedVisible: true },
    ]);
  });

  it("defaults an unflagged bullet to its section's claim", () => {
    const parsed = parseVisibilityMarkdown("## a.png\n\n### visible\n\n- Title\n");
    expect(parsed.get("a.png")?.[0]).toEqual({
      element: "Title",
      askedAs: "visible",
      expectedVisible: true,
    });
  });

  it("expects 'not visible' for a FALSE-flagged bullet under visible", () => {
    const parsed = parseVisibilityMarkdown(
      '## a.png\n\n### visible\n\n- The "Orbit" chewing gum logo | FALSE\n',
    );
    expect(parsed.get("a.png")?.[0]).toEqual({
      element: 'The "Orbit" chewing gum logo',
      askedAs: "visible",
      expectedVisible: false,
    });
  });

  it("expects 'visible' for a FALSE-flagged bullet under absent", () => {
    const parsed = parseVisibilityMarkdown("## a.png\n\n### absent\n\n- A search bar | FALSE\n");
    expect(parsed.get("a.png")?.[0]).toEqual({
      element: "A search bar",
      askedAs: "hidden",
      expectedVisible: true,
    });
  });

  it("accepts an explicit TRUE flag as the default", () => {
    const parsed = parseVisibilityMarkdown("## a.png\n\n### visible\n\n- Title | TRUE\n");
    expect(parsed.get("a.png")?.[0]).toEqual({
      element: "Title",
      askedAs: "visible",
      expectedVisible: true,
    });
  });

  it("accepts a flag in any case and with loose spacing", () => {
    const parsed = parseVisibilityMarkdown(
      "## a.png\n\n### visible\n\n- Title |false\n- Other   |   False   \n",
    );
    expect(parsed.get("a.png")?.map((e) => e.expectedVisible)).toEqual([false, false]);
    expect(parsed.get("a.png")?.map((e) => e.element)).toEqual(["Title", "Other"]);
  });

  it("leaves a pipe inside a description alone when no flag follows", () => {
    const parsed = parseVisibilityMarkdown("## a.png\n\n### visible\n\n- A | B toggle\n");
    expect(parsed.get("a.png")?.[0]).toEqual({
      element: "A | B toggle",
      askedAs: "visible",
      expectedVisible: true,
    });
  });

  it("treats only the last pipe as the flag separator", () => {
    const parsed = parseVisibilityMarkdown("## a.png\n\n### visible\n\n- A | B toggle | FALSE\n");
    expect(parsed.get("a.png")?.[0]).toEqual({
      element: "A | B toggle",
      askedAs: "visible",
      expectedVisible: false,
    });
  });

  it("rejects a bullet that is only a flag", () => {
    expect(() => parseVisibilityMarkdown("## a.png\n\n### visible\n\n- | FALSE\n")).toThrow(
      /flag but no element description/,
    );
  });

  it("detects a duplicate by description, ignoring the flags", () => {
    expect(() =>
      parseVisibilityMarkdown("## a.png\n\n### visible\n\n- Title\n- Title | FALSE\n"),
    ).toThrow(/listed twice/);
  });

  it("rejects an unknown sub-heading", () => {
    expect(() => parseVisibilityMarkdown("## a.png\n\n### maybe\n\n- Title\n")).toThrow(
      /unknown section "### maybe"/,
    );
  });

  it("rejects a bullet that is not inside a section", () => {
    expect(() => parseVisibilityMarkdown("## a.png\n\n- Title\n")).toThrow(/not inside a/);
  });

  it("rejects a section heading before any filename heading", () => {
    expect(() => parseVisibilityMarkdown("### visible\n\n- Title\n")).toThrow(
      /before any "## <filename>" heading/,
    );
  });

  it("rejects a duplicate filename heading", () => {
    expect(() =>
      parseVisibilityMarkdown("## a.png\n\n### visible\n\n- T\n\n## a.png\n\n### visible\n\n- U\n"),
    ).toThrow(/duplicate heading "a.png"/);
  });

  it("rejects an element listed as both visible and absent", () => {
    expect(() =>
      parseVisibilityMarkdown("## a.png\n\n### visible\n\n- Title\n\n### absent\n\n- Title\n"),
    ).toThrow(/listed twice/);
  });

  it("rejects an element repeated within one section", () => {
    expect(() => parseVisibilityMarkdown("## a.png\n\n### visible\n\n- Title\n- Title\n")).toThrow(
      /listed twice/,
    );
  });

  it("rejects an image with no elements at all", () => {
    expect(() => parseVisibilityMarkdown("## a.png\n\n### visible\n\n### absent\n")).toThrow(
      /lists no elements/,
    );
  });

  it("reports the offending line number", () => {
    expect(() => parseVisibilityMarkdown("## a.png\n\n### nope\n")).toThrow(/line 3/);
  });
});

describe("sortedElements", () => {
  function entries(texts: string[], expectedVisible = true): ParsedElement[] {
    return texts.map((element) => ({
      element,
      askedAs: expectedVisible ? "visible" : "hidden",
      expectedVisible,
    }));
  }

  it("merges every bullet into one sorted order", () => {
    expect(sortedElements([...entries(["b", "d"]), ...entries(["a", "c"], false)])).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("produces the same order regardless of the expected answers", () => {
    const asLabelled = sortedElements([...entries(["b", "d"]), ...entries(["a", "c"], false)]);
    const flipped = sortedElements([...entries(["a", "c"]), ...entries(["b", "d"], false)]);
    expect(flipped).toEqual(asLabelled);
  });
});

describe("visibilityPromptHash", () => {
  it("is stable for the same two call lists", () => {
    expect(visibilityPromptHash(["a"], ["b"])).toBe(visibilityPromptHash(["a"], ["b"]));
  });

  it("changes when an element is reworded", () => {
    expect(visibilityPromptHash(["a"], ["b"])).not.toBe(
      visibilityPromptHash(["a reworded"], ["b"]),
    );
  });

  it("changes when an element is added", () => {
    expect(visibilityPromptHash(["a"], [])).not.toBe(visibilityPromptHash(["a", "b"], []));
  });

  it("distinguishes the two prompt modes, since they ask different questions", () => {
    expect(visibilityPromptHash(["a"], [])).not.toBe(visibilityPromptHash([], ["a"]));
  });
});

describe("loadVisibilityGroundTruth", () => {
  it("hashes the image bytes and the prompt, sorted by filename", async () => {
    const dir = tempDataset(SAMPLE, { "a.png": "alpha", "b.png": "beta" });
    const images = await loadVisibilityGroundTruth(dir);
    expect(images.map((i) => i.filename)).toEqual(["a.png", "b.png"]);
    const first = images[0];
    expect(first?.sha256).toBe(sha256(Buffer.from("alpha")));
    expect(first?.elements).toEqual(["A search bar", "A settings gear icon", 'The "Orbit" title']);
    expect(first?.visibleCall).toEqual(["A search bar", 'The "Orbit" title']);
    expect(first?.hiddenCall).toEqual(["A settings gear icon"]);
    expect(first?.promptHash).toBe(
      visibilityPromptHash(first?.visibleCall ?? [], first?.hiddenCall ?? []),
    );
  });

  it("resolves truth flags into the expected-visible and expected-absent lists", async () => {
    const markdown =
      "## a.png\n\n### visible\n\n- Real title\n- Chewing gum logo | FALSE\n\n### absent\n\n- Gear icon\n";
    const dir = tempDataset(markdown, { "a.png": "alpha" });
    const [first] = await loadVisibilityGroundTruth(dir);
    expect(first?.expectedVisible).toEqual(["Real title"]);
    // The near-miss is asked with the visible prompt but expected absent.
    expect(first?.visibleCall).toEqual(["Chewing gum logo", "Real title"]);
    expect(first?.hiddenCall).toEqual(["Gear icon"]);
  });

  it("keeps the truth flag out of the prompt, so toggling one does not invalidate runs", async () => {
    const withFlag = tempDataset("## a.png\n\n### visible\n\n- Title | FALSE\n", { "a.png": "x" });
    const without = tempDataset("## a.png\n\n### visible\n\n- Title\n", { "a.png": "x" });
    const [flagged] = await loadVisibilityGroundTruth(withFlag);
    const [plain] = await loadVisibilityGroundTruth(without);
    expect(flagged?.elements).toEqual(["Title"]);
    expect(flagged?.promptHash).toBe(plain?.promptHash);
    expect(flagged?.expectedVisible).toEqual([]);
    expect(plain?.expectedVisible).toEqual(["Title"]);
  });

  it("names every missing image file in one error", async () => {
    const dir = tempDataset(SAMPLE, { "a.png": "alpha" });
    await expect(loadVisibilityGroundTruth(dir)).rejects.toThrow(/b\.png/);
  });
});

describe("resolveVisibilityDataset", () => {
  it("defaults to the configured visibility dataset", () => {
    // The configured default is normally on disk, but a checkout may lack it.
    // Either way it is the id resolution reaches for.
    try {
      expect(resolveVisibilityDataset().id).toBe(visibilityBenchConfig.dataset);
    } catch (error) {
      expect((error as Error).message).toContain(visibilityBenchConfig.dataset);
    }
  });

  it("rejects a directory that only has the screenshot bench's ground truth", () => {
    const dir = mkdtempSync(join(tmpdir(), "visibility-dataset-"));
    writeFileSync(join(dir, "issues_per_file.md"), "## a.png\n\n- broken\n", "utf8");
    expect(() => resolveVisibilityDataset(dir)).toThrow(/visibility_per_file\.md/);
  });

  it("accepts any directory containing visibility_per_file.md", () => {
    const dir = tempDataset(SAMPLE);
    expect(resolveVisibilityDataset(dir).dir).toBe(dir);
  });
});

describe("listVisibilityDatasetIds", () => {
  it("lists only datasets carrying visibility_per_file.md", () => {
    // Which datasets exist varies by checkout; assert the filter, not an id.
    for (const id of listVisibilityDatasetIds()) {
      expect(existsSync(join(datasetFrom(id).dir, VISIBILITY_FILE))).toBe(true);
    }
  });
});

describe("visibilityResultsDir", () => {
  it("nests under the dataset's results directory", () => {
    const dataset = datasetFrom("shots");
    expect(visibilityResultsDir(dataset)).toBe(join(dataset.resultsDir, "visibility"));
  });
});

describe("rendering-quality axis", () => {
  it("hashes the presence-only prompt differently from the default", () => {
    expect(visibilityPromptHash(["a"], ["b"], false)).not.toBe(visibilityPromptHash(["a"], ["b"]));
  });

  it("leaves the hash unchanged when only the hidden call exists, which ignores the option", () => {
    expect(visibilityPromptHash([], ["b"], false)).toBe(visibilityPromptHash([], ["b"]));
  });

  it("returns the image's own hash for the default, rendering-judged setting", () => {
    const image = {
      filename: "a.png",
      sha256: "s",
      visibleCall: ["a"],
      hiddenCall: ["b"],
      elements: ["a", "b"],
      expectedVisible: ["a"],
      promptHash: visibilityPromptHash(["a"], ["b"]),
    };
    expect(imagePromptHash(image, true)).toBe(image.promptHash);
    expect(imagePromptHash(image, false)).toBe(visibilityPromptHash(["a"], ["b"], false));
  });
});
