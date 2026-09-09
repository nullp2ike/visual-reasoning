import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Dataset } from "../../src/dataset.js";
import { readJsonIfExists, runModelDir } from "../../src/util.js";
import { visibilityResultsDir } from "./ground-truth.js";
import {
  VisibilityRunRecordSchema,
  type VisibilityImage,
  type VisibilityRunRecord,
} from "./types.js";

/** Root of the per-(model, image, rep) run records for a dataset. */
export function runsDir(dataset: Dataset): string {
  return join(visibilityResultsDir(dataset), "runs");
}

export interface RecordKey {
  model: string;
  filename: string;
  rep: number;
}

/**
 * Records are keyed by the real filename rather than an anonymous id: only the
 * image bytes and the element descriptions ever reach a model, so a filename
 * cannot leak the answer, and skipping the manifest means ground-truth edits
 * are guarded by the per-record hashes alone.
 */
export function recordPath(
  dataset: Dataset,
  key: RecordKey,
  reasoningEffort: string,
  imageFidelity: string,
): string {
  return join(
    runsDir(dataset),
    runModelDir(key.model, reasoningEffort, imageFidelity),
    key.filename,
    `rep_${key.rep}.json`,
  );
}

/**
 * A record is current when it was produced from the same image bytes and the
 * same prompt as the ground truth holds now. Moving an element between
 * `visible` and `absent` changes neither, so re-labelling regrades existing
 * records for free; rewording an element changes the prompt and invalidates them.
 */
export function isRecordCurrent(record: VisibilityRunRecord, image: VisibilityImage): boolean {
  return record.promptHash === image.promptHash && record.imageSha256 === image.sha256;
}

/** Load every run record on disk for a dataset, skipping any that no longer parse. */
export async function loadVisibilityRecords(dataset: Dataset): Promise<VisibilityRunRecord[]> {
  const root = runsDir(dataset);
  const records: VisibilityRunRecord[] = [];
  let modelDirs: string[];
  try {
    modelDirs = await readdir(root);
  } catch {
    return records;
  }
  for (const model of modelDirs) {
    let imageDirs: string[];
    try {
      imageDirs = await readdir(join(root, model));
    } catch {
      continue;
    }
    for (const image of imageDirs) {
      let files: string[];
      try {
        files = await readdir(join(root, model, image));
      } catch {
        continue;
      }
      for (const file of files.filter((f) => f.endsWith(".json"))) {
        const raw = await readJsonIfExists(join(root, model, image, file));
        const parsed = VisibilityRunRecordSchema.safeParse(raw);
        if (parsed.success) {
          records.push(parsed.data);
        } else {
          console.warn(`Skipping unparseable run record: ${model}/${image}/${file}`);
        }
      }
    }
  }
  return records;
}
