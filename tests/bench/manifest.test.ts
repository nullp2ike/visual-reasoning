import { describe, expect, it } from "vitest";
import { assignImageIds, diffManifests, parseIssuesMarkdown } from "../../bench/src/manifest.js";
import type { Manifest } from "../../bench/src/types.js";

const SAMPLE_MD = `# Issues per file

## nav_misaligned.png

- Nav icon is misaligned
- Another issue on the same page

## clean.png

-

## empty_list.png

- Badge shows 0 items
`;

describe("parseIssuesMarkdown", () => {
  it("maps filenames to their issue bullets", () => {
    const parsed = parseIssuesMarkdown(SAMPLE_MD);
    expect(parsed.get("nav_misaligned.png")).toEqual([
      "Nav icon is misaligned",
      "Another issue on the same page",
    ]);
    expect(parsed.get("empty_list.png")).toEqual(["Badge shows 0 items"]);
  });

  it("treats a bare dash bullet as zero expected issues", () => {
    const parsed = parseIssuesMarkdown(SAMPLE_MD);
    expect(parsed.get("clean.png")).toEqual([]);
  });

  it("ignores content before the first heading", () => {
    const parsed = parseIssuesMarkdown("- stray bullet\n\n## a.png\n\n- real issue\n");
    expect([...parsed.keys()]).toEqual(["a.png"]);
    expect(parsed.get("a.png")).toEqual(["real issue"]);
  });

  it("parses the dataset markdown shape", () => {
    const parsed = parseIssuesMarkdown(
      "## balance_negative.png\n\n- The balance shows a negative value\n",
    );
    expect(parsed.get("balance_negative.png")).toEqual(["The balance shows a negative value"]);
  });
});

function makeManifest(overrides?: Partial<Manifest>): Manifest {
  return {
    schemaVersion: 1,
    promptHash: "hash-a",
    generatedAt: "2026-07-22T00:00:00.000Z",
    entries: [
      { imageId: "img_01", filename: "a.png", sha256: "sha-a", expectedIssues: ["issue A"] },
      { imageId: "img_02", filename: "b.png", sha256: "sha-b", expectedIssues: [] },
    ],
    retired: [],
    ...overrides,
  };
}

describe("assignImageIds", () => {
  it("assigns sequential sorted IDs when there is no previous manifest", () => {
    const ids = assignImageIds(["b.png", "a.png"], undefined);
    expect(ids.get("a.png")).toBe("img_01");
    expect(ids.get("b.png")).toBe("img_02");
  });

  it("keeps existing IDs for surviving filenames and does not renumber on removal", () => {
    const previous = makeManifest({
      entries: [
        { imageId: "img_01", filename: "a.png", sha256: "s", expectedIssues: [] },
        { imageId: "img_07", filename: "clean.png", sha256: "s", expectedIssues: [] },
        { imageId: "img_08", filename: "icon_missing.png", sha256: "s", expectedIssues: [] },
        { imageId: "img_09", filename: "y.png", sha256: "s", expectedIssues: [] },
        { imageId: "img_10", filename: "z.png", sha256: "s", expectedIssues: [] },
      ],
    });
    const ids = assignImageIds(["a.png", "y.png", "z.png"], previous);
    expect(ids.get("a.png")).toBe("img_01");
    expect(ids.get("y.png")).toBe("img_09");
    expect(ids.get("z.png")).toBe("img_10");
  });

  it("gives new filenames the next unused ID, never reusing retired IDs", () => {
    const previous = makeManifest({
      entries: [{ imageId: "img_02", filename: "b.png", sha256: "s", expectedIssues: [] }],
      retired: [{ imageId: "img_05", filename: "gone.png", sha256: "s" }],
    });
    const ids = assignImageIds(["b.png", "new.png"], previous);
    expect(ids.get("b.png")).toBe("img_02");
    expect(ids.get("new.png")).toBe("img_06");
  });

  it("reclaims a retired ID when the same filename returns", () => {
    const previous = makeManifest({
      entries: [{ imageId: "img_01", filename: "a.png", sha256: "s", expectedIssues: [] }],
      retired: [{ imageId: "img_07", filename: "clean.png", sha256: "s" }],
    });
    const ids = assignImageIds(["a.png", "clean.png"], previous);
    expect(ids.get("clean.png")).toBe("img_07");
  });
});

describe("diffManifests", () => {
  it("classifies identical manifests as identical", () => {
    expect(diffManifests(makeManifest(), makeManifest()).kind).toBe("identical");
  });

  it("classifies a changed prompt hash as breaking", () => {
    const diff = diffManifests(makeManifest(), makeManifest({ promptHash: "hash-b" }));
    expect(diff.kind).toBe("breaking");
    expect(diff.details.join()).toContain("prompt hash");
  });

  it("classifies changed image bytes of a surviving image as breaking", () => {
    const fresh = makeManifest();
    fresh.entries = fresh.entries.map((e, i) => (i === 0 ? { ...e, sha256: "sha-changed" } : e));
    const diff = diffManifests(makeManifest(), fresh);
    expect(diff.kind).toBe("breaking");
    expect(diff.details.join()).toContain("image bytes changed");
  });

  it("classifies changed expected issues of a surviving image as breaking", () => {
    const fresh = makeManifest();
    fresh.entries = fresh.entries.map((e, i) =>
      i === 0 ? { ...e, expectedIssues: ["reworded"] } : e,
    );
    const diff = diffManifests(makeManifest(), fresh);
    expect(diff.kind).toBe("breaking");
    expect(diff.details.join()).toContain("expected issues changed");
  });

  it("classifies pure removals as membership with retirement details", () => {
    const fresh = makeManifest({
      entries: [makeManifest().entries[0]!],
      retired: [{ imageId: "img_02", filename: "b.png", sha256: "sha-b" }],
    });
    const diff = diffManifests(makeManifest(), fresh);
    expect(diff.kind).toBe("membership");
    expect(diff.details.join()).toContain("retired img_02 (b.png)");
  });

  it("classifies pure additions as membership", () => {
    const fresh = makeManifest({
      entries: [
        ...makeManifest().entries,
        { imageId: "img_03", filename: "c.png", sha256: "sha-c", expectedIssues: ["x"] },
      ],
    });
    const diff = diffManifests(makeManifest(), fresh);
    expect(diff.kind).toBe("membership");
    expect(diff.details.join()).toContain("added img_03 (c.png)");
  });

  it("classifies mixed membership + content change as breaking", () => {
    const fresh = makeManifest({
      entries: [{ ...makeManifest().entries[0]!, sha256: "sha-changed" }],
      retired: [{ imageId: "img_02", filename: "b.png", sha256: "sha-b" }],
    });
    expect(diffManifests(makeManifest(), fresh).kind).toBe("breaking");
  });
});
