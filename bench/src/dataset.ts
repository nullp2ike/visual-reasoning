import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { benchConfig } from "../bench.config.js";

export const BENCH_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Root holding one directory per dataset. Everything but `example/` is gitignored. */
export const DATASETS_DIR = join(BENCH_DIR, "datasets");

/** Root holding one directory of results per dataset. Fully gitignored. */
export const RESULTS_ROOT = join(BENCH_DIR, "results");

/** The file inside a dataset directory that lists expected issues per image. */
export const ISSUES_FILE = "issues_per_file.md";

/** Env var that selects a dataset when `--dataset` is not passed. */
export const DATASET_ENV_VAR = "BENCH_DATASET";

/**
 * A benchmark dataset: a directory of screenshots plus the `issues_per_file.md`
 * that states what is wrong with each one. Results are namespaced by dataset id
 * so two datasets never share a manifest, run records, judge cache, or report —
 * image IDs (`img_NN`) are only meaningful within one dataset.
 */
export interface Dataset {
  /** Directory name under `bench/datasets/`, e.g. "example". */
  readonly id: string;
  /** Absolute path to the dataset directory. */
  readonly dir: string;
  /** Absolute path to this dataset's results directory. */
  readonly resultsDir: string;
}

/** Dataset ids present on disk, in display order. */
export function listDatasetIds(): string[] {
  if (!existsSync(DATASETS_DIR)) return [];
  return readdirSync(DATASETS_DIR)
    .filter((name) => {
      const path = join(DATASETS_DIR, name);
      return statSync(path).isDirectory() && existsSync(join(path, ISSUES_FILE));
    })
    .sort();
}

/**
 * Build a Dataset from an id (a directory name under `bench/datasets/`) or from
 * a path, if the value contains a separator or is absolute. Path form lets a
 * dataset live outside the repo entirely; its results are still namespaced,
 * under the final path segment.
 */
export function datasetFrom(idOrPath: string): Dataset {
  const isPath = isAbsolute(idOrPath) || idOrPath.includes("/") || idOrPath.includes("\\");
  const dir = isPath ? resolve(idOrPath) : join(DATASETS_DIR, idOrPath);
  const id = isPath ? (dir.split(/[/\\]/).pop() ?? idOrPath) : idOrPath;
  return { id, dir, resultsDir: join(RESULTS_ROOT, id) };
}

function assertUsable(dataset: Dataset): Dataset {
  if (!existsSync(join(dataset.dir, ISSUES_FILE))) {
    const available = listDatasetIds();
    throw new Error(
      `Dataset "${dataset.id}" not found: expected ${join(dataset.dir, ISSUES_FILE)}.\n` +
        (available.length > 0
          ? `Available datasets: ${available.join(", ")}.`
          : `No datasets found under ${DATASETS_DIR}.`) +
        `\nSee bench/datasets/README.md for the expected layout.`,
    );
  }
  return dataset;
}

/**
 * Resolve which dataset to use: explicit `--dataset` wins, then the
 * `BENCH_DATASET` env var, then `benchConfig.dataset`. The value may be a
 * dataset id or a path.
 */
export function resolveDatasetRef(explicit?: string): string {
  const fromEnv = process.env[DATASET_ENV_VAR]?.trim();
  return explicit ?? (fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : benchConfig.dataset);
}

let active: Dataset | undefined;

/**
 * Pick the dataset for this process and validate it exists. Entrypoints call
 * this once, before any path helper runs; everything downstream reads
 * `activeDataset()`.
 */
export function selectDataset(explicit?: string): Dataset {
  active = assertUsable(datasetFrom(resolveDatasetRef(explicit)));
  return active;
}

/** The dataset selected for this process, resolving from env/config on first use. */
export function activeDataset(): Dataset {
  active ??= assertUsable(datasetFrom(resolveDatasetRef()));
  return active;
}

/** Reset the memoized selection. Tests only. */
export function resetActiveDataset(): void {
  active = undefined;
}
