import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateManifest } from "../../../bench/discovery/src/manifest.js";
import { PROMPT_FILE, loadPrompt } from "../../../bench/discovery/src/prompt.js";
import { DATASETS_DIR, RESULTS_ROOT } from "../../../bench/shared/dataset.js";
import { sha256 } from "../../../bench/shared/util.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "discovery-prompt-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("loadPrompt", () => {
  it("returns the file verbatim, trimming only trailing whitespace", async () => {
    await writeFile(join(dir, PROMPT_FILE), "What is broken?\n\n- Not this.\n\n", "utf8");
    expect(await loadPrompt(dir)).toBe("What is broken?\n\n- Not this.");
  });

  it("names the missing file when the dataset has no prompt", async () => {
    await expect(loadPrompt(dir)).rejects.toThrow(join(dir, PROMPT_FILE));
  });

  it("rejects an empty prompt", async () => {
    await writeFile(join(dir, PROMPT_FILE), "  \n\n", "utf8");
    await expect(loadPrompt(dir)).rejects.toThrow(/empty/);
  });
});

describe("generateManifest", () => {
  it("stamps the hash of the dataset's own prompt", async () => {
    await writeFile(join(dir, PROMPT_FILE), "Dataset-specific question?\n", "utf8");
    await writeFile(join(dir, "issues_per_file.md"), "## a.png\n\n- A typo\n", "utf8");
    await writeFile(join(dir, "a.png"), "not really a png", "utf8");
    const manifest = await generateManifest(dir);
    expect(manifest.promptHash).toBe(sha256("Dataset-specific question?"));
  });
});

describe("golden dataset prompt", () => {
  it("still hashes to the prompt its tracked runs were recorded with", async () => {
    // A reflowed or re-punctuated prompt.md would silently invalidate every run.
    const manifestRaw = await readFile(
      join(RESULTS_ROOT, "golden", "discovery", "manifest.json"),
      "utf8",
    );
    const { promptHash } = JSON.parse(manifestRaw) as { promptHash: string };
    expect(sha256(await loadPrompt(join(DATASETS_DIR, "golden")))).toBe(promptHash);
  });
});
