import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertPublishable, buildSite } from "../../../bench/discovery/src/site.js";
import { selectDataset } from "../../../bench/shared/dataset.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "discovery-site-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("assertPublishable", () => {
  it("allows the public golden dataset", () => {
    expect(() => {
      assertPublishable("golden");
    }).not.toThrow();
  });

  it("refuses any dataset not on the allowlist, above all the private primary", () => {
    expect(() => {
      assertPublishable("primary");
    }).toThrow(/primary/);
    expect(() => {
      assertPublishable("my-set");
    }).toThrow(/not publishable/);
  });
});

describe("buildSite", () => {
  it("assembles read-only reports, the comparison page and only the dataset's screenshots", async () => {
    selectDataset("golden");
    const out = join(root, "site");
    const summary = await buildSite(out);

    const files = await readdir(out);
    expect(files).toEqual(
      expect.arrayContaining([
        "index.html",
        "comparison.html",
        "screenshots",
        "report.gpt-5.6-luna.html",
        "report.gemini-3.8-flash.html",
      ]),
    );
    expect(files.some((f) => f.endsWith(".md") || f.endsWith(".json"))).toBe(false);
    expect(summary.judges).toContain("gpt-5.6-luna");

    const index = await readFile(join(out, "index.html"), "utf8");
    expect(index).toContain("judge gpt-5.6-luna");
    expect(index).toContain("const READ_ONLY = true;");
    expect(index).toContain('"imageBase":"screenshots"');
    expect(index).toContain('<a href="comparison.html">comparison</a>');

    const screenshots = await readdir(join(out, "screenshots"));
    expect(screenshots).toHaveLength(summary.screenshots);
    expect(screenshots).toContain("00_clean_control.png");
    expect(screenshots.every((f) => f.endsWith(".png"))).toBe(true);
  });

  it("rebuilds over its own previous output", async () => {
    selectDataset("golden");
    const out = join(root, "site");
    await buildSite(out);
    await writeFile(join(out, "stale.html"), "old", "utf8");
    await buildSite(out);
    expect(existsSync(join(out, "stale.html"))).toBe(false);
  });

  it("refuses to clear a non-empty directory it did not create", async () => {
    selectDataset("golden");
    const out = join(root, "not-a-site");
    await mkdir(out);
    await writeFile(join(out, "precious.txt"), "keep me", "utf8");
    await expect(buildSite(out)).rejects.toThrow(/not a previous site build/);
    expect(existsSync(join(out, "precious.txt"))).toBe(true);
  });
});
