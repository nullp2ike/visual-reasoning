import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BENCH_PROMPT } from "../bench.config.js";
import { ManifestSchema, type Manifest, type ManifestEntry } from "./types.js";
import { GOLDEN_DIR, RESULTS_DIR, atomicWriteJson, readJsonIfExists, sha256 } from "./util.js";

export const MANIFEST_PATH = join(RESULTS_DIR, "manifest.json");

/**
 * Parse issues_per_file.md: `## <filename>` headings followed by `- <issue>` bullets.
 * A bare `-` bullet (the no-bugs control) yields an empty issue list.
 */
export function parseIssuesMarkdown(markdown: string): Map<string, string[]> {
  const issuesByFile = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of markdown.split("\n")) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading?.[1]) {
      current = [];
      issuesByFile.set(heading[1], current);
      continue;
    }
    const bullet = /^-\s*(.*?)\s*$/.exec(line);
    if (bullet && current) {
      const text = bullet[1] ?? "";
      if (text.length > 0) current.push(text);
    }
  }
  return issuesByFile;
}

/** Build a manifest from golden_data_set/, assigning stable anonymous img_NN IDs. */
export async function generateManifest(goldenDir: string = GOLDEN_DIR): Promise<Manifest> {
  const markdown = await readFile(join(goldenDir, "issues_per_file.md"), "utf8");
  const issuesByFile = parseIssuesMarkdown(markdown);
  const filenames = [...issuesByFile.keys()].sort();
  const entries: ManifestEntry[] = [];
  for (const [index, filename] of filenames.entries()) {
    const bytes = await readFile(join(goldenDir, filename));
    entries.push({
      imageId: `img_${String(index + 1).padStart(2, "0")}`,
      filename,
      sha256: sha256(bytes),
      expectedIssues: issuesByFile.get(filename) ?? [],
    });
  }
  return {
    schemaVersion: 1,
    promptHash: sha256(BENCH_PROMPT),
    generatedAt: new Date().toISOString(),
    entries,
  };
}

export async function loadCommittedManifest(): Promise<Manifest | undefined> {
  const raw = await readJsonIfExists(MANIFEST_PATH);
  if (raw === undefined) return undefined;
  return ManifestSchema.parse(raw);
}

/**
 * Compare a freshly generated manifest against the committed one. Any difference in
 * image IDs, filenames, hashes, expected issues, or prompt hash invalidates existing
 * runs and must be a deliberate regeneration (`--force`).
 */
export function manifestMismatch(committed: Manifest, fresh: Manifest): string | undefined {
  if (committed.promptHash !== fresh.promptHash) {
    return "prompt hash changed (BENCH_PROMPT was edited)";
  }
  if (committed.entries.length !== fresh.entries.length) {
    return `image count changed (${committed.entries.length} -> ${fresh.entries.length})`;
  }
  for (const [i, freshEntry] of fresh.entries.entries()) {
    const committedEntry = committed.entries[i];
    if (!committedEntry) return `missing committed entry at index ${i}`;
    if (
      committedEntry.imageId !== freshEntry.imageId ||
      committedEntry.filename !== freshEntry.filename
    ) {
      return `entry ${freshEntry.imageId}: filename/ID assignment changed`;
    }
    if (committedEntry.sha256 !== freshEntry.sha256) {
      return `entry ${freshEntry.imageId} (${freshEntry.filename}): image bytes changed`;
    }
    if (
      JSON.stringify(committedEntry.expectedIssues) !== JSON.stringify(freshEntry.expectedIssues)
    ) {
      return `entry ${freshEntry.imageId} (${freshEntry.filename}): expected issues changed`;
    }
  }
  return undefined;
}

/**
 * Load the committed manifest, verifying it still matches the dataset on disk.
 * Generates and writes it on first use; `force` rewrites it unconditionally.
 */
export async function ensureManifest(force = false): Promise<Manifest> {
  const fresh = await generateManifest();
  const committed = await loadCommittedManifest();
  if (!committed || force) {
    await atomicWriteJson(MANIFEST_PATH, fresh);
    return fresh;
  }
  const mismatch = manifestMismatch(committed, fresh);
  if (mismatch) {
    throw new Error(
      `Committed manifest disagrees with golden_data_set/: ${mismatch}. ` +
        `Existing runs may be invalid. Re-run with --force to regenerate the manifest deliberately.`,
    );
  }
  return committed;
}

const isDirectRun = process.argv[1]?.endsWith("manifest.ts") ?? false;
if (isDirectRun) {
  const force = process.argv.includes("--force");
  ensureManifest(force)
    .then((manifest) => {
      console.log(`Manifest OK: ${manifest.entries.length} images -> ${MANIFEST_PATH}`);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
