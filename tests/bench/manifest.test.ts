import { describe, expect, it } from "vitest";
import { manifestMismatch, parseIssuesMarkdown } from "../../bench/src/manifest.js";
import type { Manifest } from "../../bench/src/types.js";

const SAMPLE_MD = `# Issues per file

## bottom_nav_broken.png

- Casino icon design is broken
- Another issue on the same page

## no_bugs.png

-

## zero_games.png

- Badge shows 0 games
`;

describe("parseIssuesMarkdown", () => {
  it("maps filenames to their issue bullets", () => {
    const parsed = parseIssuesMarkdown(SAMPLE_MD);
    expect(parsed.get("bottom_nav_broken.png")).toEqual([
      "Casino icon design is broken",
      "Another issue on the same page",
    ]);
    expect(parsed.get("zero_games.png")).toEqual(["Badge shows 0 games"]);
  });

  it("treats a bare dash bullet as zero expected issues", () => {
    const parsed = parseIssuesMarkdown(SAMPLE_MD);
    expect(parsed.get("no_bugs.png")).toEqual([]);
  });

  it("ignores content before the first heading", () => {
    const parsed = parseIssuesMarkdown("- stray bullet\n\n## a.png\n\n- real issue\n");
    expect([...parsed.keys()]).toEqual(["a.png"]);
    expect(parsed.get("a.png")).toEqual(["real issue"]);
  });

  it("parses the real golden dataset markdown shape", () => {
    const parsed = parseIssuesMarkdown(
      "## jackpots_typo.png\n\n- The word Jackpots is misspelled Jacpots\n",
    );
    expect(parsed.get("jackpots_typo.png")).toEqual(["The word Jackpots is misspelled Jacpots"]);
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
    ...overrides,
  };
}

describe("manifestMismatch", () => {
  it("returns undefined for identical manifests", () => {
    expect(manifestMismatch(makeManifest(), makeManifest())).toBeUndefined();
  });

  it("detects a changed prompt hash", () => {
    const fresh = makeManifest({ promptHash: "hash-b" });
    expect(manifestMismatch(makeManifest(), fresh)).toContain("prompt hash");
  });

  it("detects added or removed images", () => {
    const fresh = makeManifest();
    fresh.entries = fresh.entries.slice(0, 1);
    expect(manifestMismatch(makeManifest(), fresh)).toContain("image count");
  });

  it("detects changed image bytes", () => {
    const fresh = makeManifest();
    fresh.entries = fresh.entries.map((e, i) => (i === 0 ? { ...e, sha256: "sha-changed" } : e));
    expect(manifestMismatch(makeManifest(), fresh)).toContain("image bytes changed");
  });

  it("detects changed expected issues", () => {
    const fresh = makeManifest();
    fresh.entries = fresh.entries.map((e, i) =>
      i === 0 ? { ...e, expectedIssues: ["reworded"] } : e,
    );
    expect(manifestMismatch(makeManifest(), fresh)).toContain("expected issues changed");
  });

  it("detects re-assigned image IDs", () => {
    const fresh = makeManifest();
    fresh.entries = [
      { ...fresh.entries[0]!, filename: "b.png" },
      { ...fresh.entries[1]!, filename: "a.png" },
    ];
    expect(manifestMismatch(makeManifest(), fresh)).toContain("assignment changed");
  });
});
