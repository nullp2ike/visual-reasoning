import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BENCH_PROMPT } from "../bench.config.js";
import { ISSUES_FILE, selectDataset } from "./dataset.js";
import { ManifestSchema, type Manifest, type ManifestEntry, type RetiredEntry } from "./types.js";
import { datasetDir, resultsDir, atomicWriteJson, readJsonIfExists, sha256 } from "./util.js";

export function manifestPath(): string {
  return join(resultsDir(), "manifest.json");
}

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

function idNumber(imageId: string): number {
  return Number(imageId.slice("img_".length));
}

function formatImageId(n: number): string {
  return `img_${String(n).padStart(2, "0")}`;
}

/**
 * Assign img_NN IDs to the current dataset filenames, keeping IDs stable across
 * dataset changes: a filename present in the previous manifest (active or retired)
 * keeps its ID; new filenames get the next unused number. Retired IDs are never
 * reassigned to a different file, so existing run records can never mis-join.
 */
export function assignImageIds(
  filenames: readonly string[],
  previous: Manifest | undefined,
): Map<string, string> {
  const known = new Map<string, string>();
  let maxN = 0;
  for (const entry of [...(previous?.entries ?? []), ...(previous?.retired ?? [])]) {
    known.set(entry.filename, entry.imageId);
    maxN = Math.max(maxN, idNumber(entry.imageId));
  }

  const ids = new Map<string, string>();
  for (const filename of [...filenames].sort()) {
    const existing = known.get(filename);
    if (existing) {
      ids.set(filename, existing);
    } else {
      maxN += 1;
      ids.set(filename, formatImageId(maxN));
    }
  }
  return ids;
}

/** Build a manifest from the dataset directory, keeping IDs stable against `previous`. */
export async function generateManifest(
  goldenDir: string = datasetDir(),
  previous?: Manifest,
): Promise<Manifest> {
  const markdown = await readFile(join(goldenDir, ISSUES_FILE), "utf8");
  const issuesByFile = parseIssuesMarkdown(markdown);
  const filenames = [...issuesByFile.keys()].sort();
  const ids = assignImageIds(filenames, previous);

  const entries: ManifestEntry[] = [];
  for (const filename of filenames) {
    const bytes = await readFile(join(goldenDir, filename));
    const imageId = ids.get(filename);
    if (!imageId) throw new Error(`Internal: no ID assigned for ${filename}`);
    entries.push({
      imageId,
      filename,
      sha256: sha256(bytes),
      expectedIssues: issuesByFile.get(filename) ?? [],
    });
  }

  // Previous images (active or already retired) no longer on disk keep their
  // IDs reserved in the retired ledger.
  const currentFiles = new Set(filenames);
  const retiredById = new Map<string, RetiredEntry>();
  for (const entry of [...(previous?.retired ?? []), ...(previous?.entries ?? [])]) {
    if (!currentFiles.has(entry.filename)) {
      retiredById.set(entry.imageId, {
        imageId: entry.imageId,
        filename: entry.filename,
        sha256: entry.sha256,
      });
    }
  }
  const retired = [...retiredById.values()].sort(
    (a, b) => idNumber(a.imageId) - idNumber(b.imageId),
  );

  return {
    schemaVersion: 1,
    promptHash: sha256(BENCH_PROMPT),
    generatedAt: new Date().toISOString(),
    entries,
    retired,
  };
}

export async function loadStoredManifest(): Promise<Manifest | undefined> {
  const raw = await readJsonIfExists(manifestPath());
  if (raw === undefined) return undefined;
  return ManifestSchema.parse(raw);
}

export interface ManifestDiff {
  kind: "identical" | "membership" | "breaking";
  details: string[];
}

/**
 * Classify the difference between the stored manifest and a freshly generated
 * one (built with stable IDs against the stored manifest):
 * - `breaking`: prompt hash changed, or a surviving image's bytes/expected issues/ID
 *   changed — existing runs are invalid, regeneration must be deliberate (`--force`).
 * - `membership`: only additions and/or removals — safe to auto-regenerate; run
 *   records for retired images are simply ignored by scoring.
 * - `identical`: nothing changed.
 */
export function diffManifests(stored: Manifest, fresh: Manifest): ManifestDiff {
  const breaking: string[] = [];
  const membership: string[] = [];

  if (stored.promptHash !== fresh.promptHash) {
    breaking.push("prompt hash changed (BENCH_PROMPT was edited)");
  }

  const storedByFile = new Map(stored.entries.map((e) => [e.filename, e]));
  const freshByFile = new Map(fresh.entries.map((e) => [e.filename, e]));

  for (const [filename, freshEntry] of freshByFile) {
    const storedEntry = storedByFile.get(filename);
    if (!storedEntry) {
      membership.push(`added ${freshEntry.imageId} (${filename})`);
      continue;
    }
    if (storedEntry.imageId !== freshEntry.imageId) {
      breaking.push(`entry ${filename}: ID assignment changed`);
    }
    if (storedEntry.sha256 !== freshEntry.sha256) {
      breaking.push(`entry ${freshEntry.imageId} (${filename}): image bytes changed`);
    }
    if (JSON.stringify(storedEntry.expectedIssues) !== JSON.stringify(freshEntry.expectedIssues)) {
      breaking.push(`entry ${freshEntry.imageId} (${filename}): expected issues changed`);
    }
  }
  for (const [filename, storedEntry] of storedByFile) {
    if (!freshByFile.has(filename)) {
      membership.push(`retired ${storedEntry.imageId} (${filename})`);
    }
  }

  if (breaking.length > 0) return { kind: "breaking", details: [...breaking, ...membership] };
  if (membership.length > 0) return { kind: "membership", details: membership };
  return { kind: "identical", details: [] };
}

/**
 * Load the stored manifest, verifying it still matches the dataset on disk.
 * Generates and writes it on first use. Pure additions/removals auto-regenerate
 * with stable IDs (removed images go to the retired ledger); content changes to
 * surviving images require `force`.
 */
export async function ensureManifest(force = false): Promise<Manifest> {
  const stored = await loadStoredManifest();
  const fresh = await generateManifest(datasetDir(), stored);
  if (!stored || force) {
    await atomicWriteJson(manifestPath(), fresh);
    return fresh;
  }
  const diff = diffManifests(stored, fresh);
  if (diff.kind === "breaking") {
    throw new Error(
      `Stored manifest disagrees with ${datasetDir()}: ${diff.details.join("; ")}. ` +
        `Existing runs may be invalid. Re-run with --force to regenerate the manifest deliberately. ` +
        `(Pure image additions/removals regenerate automatically and never need --force.)`,
    );
  }
  if (diff.kind === "membership") {
    for (const detail of diff.details) {
      console.log(`Manifest updated: ${detail}`);
    }
    await atomicWriteJson(manifestPath(), fresh);
    return fresh;
  }
  return stored;
}

const isDirectRun = process.argv[1]?.endsWith("manifest.ts") ?? false;
if (isDirectRun) {
  const force = process.argv.includes("--force");
  const datasetFlag = process.argv.indexOf("--dataset");
  Promise.resolve()
    .then(async () => {
      const dataset = selectDataset(datasetFlag === -1 ? undefined : process.argv[datasetFlag + 1]);
      console.log(`Dataset: ${dataset.id} (${dataset.dir})`);
      return ensureManifest(force);
    })
    .then((manifest) => {
      console.log(`Manifest OK: ${manifest.entries.length} images -> ${manifestPath()}`);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
