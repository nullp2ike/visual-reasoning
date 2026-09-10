import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DATASETS_DIR,
  DATASET_ENV_VAR,
  RESULTS_ROOT,
  activeDataset,
  assertDatasetHasFile,
  datasetFrom,
  listDatasetIds,
  resetActiveDataset,
  resolveDatasetRef,
  selectDataset,
} from "../../../bench/shared/dataset.js";
import { benchConfig } from "../../../bench/bench.config.js";

const originalEnv = process.env[DATASET_ENV_VAR];

/**
 * A throwaway directory that passes as a screenshot dataset. Keeps these tests
 * off the repo's real datasets, whose contents are not theirs to depend on.
 */
function tempScreenshotDataset(): string {
  const dir = mkdtempSync(join(tmpdir(), "bench-dataset-"));
  writeFileSync(join(dir, "issues_per_file.md"), "## a.png\n\n- broken\n", "utf8");
  return dir;
}

beforeEach(() => {
  Reflect.deleteProperty(process.env, DATASET_ENV_VAR);
  resetActiveDataset();
});

afterEach(() => {
  if (originalEnv === undefined) Reflect.deleteProperty(process.env, DATASET_ENV_VAR);
  else process.env[DATASET_ENV_VAR] = originalEnv;
  resetActiveDataset();
});

describe("datasetFrom", () => {
  it("treats a bare name as a directory under bench/datasets/", () => {
    const dataset = datasetFrom("checkout-screens");
    expect(dataset.id).toBe("checkout-screens");
    expect(dataset.dir).toBe(join(DATASETS_DIR, "checkout-screens"));
    expect(dataset.resultsDir).toBe(join(RESULTS_ROOT, "checkout-screens"));
  });

  it("treats a value with a separator as a path, taking the id from its last segment", () => {
    const external = join(tmpdir(), "some-place", "checkout-screens");
    const dataset = datasetFrom(external);
    expect(dataset.id).toBe("checkout-screens");
    expect(dataset.dir).toBe(external);
  });

  it("keeps results inside the repo even for a dataset that lives outside it", () => {
    const dataset = datasetFrom(join(tmpdir(), "elsewhere", "shots"));
    expect(dataset.resultsDir).toBe(join(RESULTS_ROOT, "shots"));
  });

  it("resolves a relative path against the working directory", () => {
    const dataset = datasetFrom(`.${sep}fixtures${sep}shots`);
    expect(dataset.dir).toBe(join(process.cwd(), "fixtures", "shots"));
    expect(dataset.id).toBe("shots");
  });
});

describe("resolveDatasetRef", () => {
  it("prefers an explicit value over the environment", () => {
    process.env[DATASET_ENV_VAR] = "from-env";
    expect(resolveDatasetRef("explicit")).toBe("explicit");
  });

  it("falls back to the environment when nothing is explicit", () => {
    process.env[DATASET_ENV_VAR] = "from-env";
    expect(resolveDatasetRef()).toBe("from-env");
  });

  it("ignores an empty or whitespace-only environment value", () => {
    process.env[DATASET_ENV_VAR] = "   ";
    expect(resolveDatasetRef()).toBe(benchConfig.dataset);
  });

  it("falls back to the configured default when nothing else is set", () => {
    expect(resolveDatasetRef()).toBe(benchConfig.dataset);
  });
});

describe("listDatasetIds", () => {
  it("lists only directories carrying the requested ground-truth file", () => {
    // Which datasets exist varies by checkout (`primary` is gitignored), so
    // assert the filter rather than any particular id.
    for (const id of listDatasetIds()) {
      expect(existsSync(join(DATASETS_DIR, id, "issues_per_file.md"))).toBe(true);
    }
    for (const id of listDatasetIds("assertions_per_file.md")) {
      expect(existsSync(join(DATASETS_DIR, id, "assertions_per_file.md"))).toBe(true);
    }
  });

  it("returns nothing for a ground-truth file no dataset carries", () => {
    expect(listDatasetIds("not-a-ground-truth-file.md")).toEqual([]);
  });
});

describe("assertDatasetHasFile", () => {
  it("requires issues_per_file.md by default", () => {
    const root = mkdtempSync(join(tmpdir(), "bench-dataset-"));
    writeFileSync(join(root, "assertions_per_file.md"), "## a.png\n", "utf8");
    expect(() => assertDatasetHasFile(datasetFrom(root))).toThrow(/issues_per_file\.md/);
  });

  it("accepts a directory carrying the requested file instead", () => {
    const root = mkdtempSync(join(tmpdir(), "bench-dataset-"));
    writeFileSync(join(root, "assertions_per_file.md"), "## a.png\n", "utf8");
    const dataset = datasetFrom(root);
    expect(assertDatasetHasFile(dataset, "assertions_per_file.md")).toBe(dataset);
  });
});

describe("selectDataset", () => {
  it("returns the selected dataset and makes it the active one", () => {
    const selected = selectDataset(tempScreenshotDataset());
    expect(activeDataset()).toEqual(selected);
  });

  it("rejects a dataset directory that has no issues_per_file.md", () => {
    const empty = mkdtempSync(join(tmpdir(), "bench-dataset-"));
    mkdirSync(join(empty, "no-issues-file"));
    expect(() => selectDataset(join(empty, "no-issues-file"))).toThrow(/not found/);
  });

  it("says what it looked for and points at the layout docs when it is missing", () => {
    expect(() => selectDataset("definitely-not-a-dataset")).toThrow(
      /definitely-not-a-dataset[\s\S]*README\.md/,
    );
  });

  it("accepts any directory containing issues_per_file.md", () => {
    const root = mkdtempSync(join(tmpdir(), "bench-dataset-"));
    writeFileSync(join(root, "issues_per_file.md"), "## a.png\n\n- broken\n", "utf8");
    expect(selectDataset(root).dir).toBe(root);
  });
});

describe("activeDataset", () => {
  it("resolves from the environment on first use when nothing was selected", () => {
    const dir = tempScreenshotDataset();
    process.env[DATASET_ENV_VAR] = dir;
    expect(activeDataset().dir).toBe(dir);
  });

  it("memoizes the resolution so later env changes cannot move paths mid-run", () => {
    process.env[DATASET_ENV_VAR] = tempScreenshotDataset();
    const first = activeDataset();
    process.env[DATASET_ENV_VAR] = "something-else";
    expect(activeDataset()).toEqual(first);
  });
});
