import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { benchConfig } from "../../bench.config.js";
import { activeDataset, selectDataset } from "../../shared/dataset.js";
import { datasetDir, modelDirName, readJsonIfExists } from "../../shared/util.js";
import { buildComparisonHtml, buildJudgeComparison } from "./compare.js";
import { buildReportHtml } from "./html.js";
import { ensureManifest } from "./manifest.js";
import { discoverScores } from "./report.js";
import { overridesPath } from "./score.js";
import { OverridesSchema, type Overrides } from "./types.js";

/**
 * Datasets whose screenshots and model output may be published. An allowlist
 * rather than "whatever is selected": `primary` holds private product UI, and
 * neither `BENCH_DATASET` nor `benchConfig.dataset` may ever route it onto a
 * public site.
 */
export const PUBLISHABLE_DATASETS: readonly string[] = ["golden"];

/** Written into every build so a rebuild only ever clears its own output. */
const SITE_MARKER = ".discovery-site";

const SCREENSHOTS_DIR = "screenshots";

export interface SiteSummary {
  outDir: string;
  judges: string[];
  screenshots: number;
}

export function assertPublishable(datasetId: string): void {
  if (!PUBLISHABLE_DATASETS.includes(datasetId)) {
    throw new Error(
      `Dataset "${datasetId}" is not publishable. Publishable datasets: ` +
        `${PUBLISHABLE_DATASETS.join(", ")} (PUBLISHABLE_DATASETS in bench/discovery/src/site.ts).`,
    );
  }
}

async function prepareOutDir(outDir: string): Promise<void> {
  if (existsSync(outDir)) {
    const entries = await readdir(outDir);
    if (entries.length > 0 && !entries.includes(SITE_MARKER)) {
      throw new Error(
        `${outDir} is not empty and is not a previous site build (no ${SITE_MARKER}); ` +
          `refusing to clear it. Pass an empty or new directory with --out.`,
      );
    }
    await rm(outDir, { recursive: true, force: true });
  }
  await mkdir(join(outDir, SCREENSHOTS_DIR), { recursive: true });
  await writeFile(join(outDir, SITE_MARKER), "Built by pnpm discovery:site.\n", "utf8");
}

/**
 * Assemble the static site for the active dataset: one read-only report per
 * judge, `index.html` for the default judge, the judge comparison as a page,
 * and the screenshots the reports link to. Only files the pages reference are
 * copied — no run records, judge cache, or scores JSON beyond what is inlined.
 */
export async function buildSite(outDir: string): Promise<SiteSummary> {
  assertPublishable(activeDataset().id);
  const manifest = await ensureManifest();
  const scoresList = await discoverScores();
  if (scoresList.length === 0) {
    throw new Error(`No scores to publish for dataset "${activeDataset().id}".`);
  }
  const overridesRaw = await readJsonIfExists(overridesPath());
  const overrides: Overrides =
    overridesRaw === undefined ? {} : OverridesSchema.parse(overridesRaw);

  await prepareOutDir(outDir);

  const judges = scoresList.map((s) => s.judgeModel);
  const defaultJudge = judges.includes(benchConfig.judgeModel) ? benchConfig.judgeModel : judges[0];
  const hasComparison = scoresList.length >= 2;

  for (const scores of scoresList) {
    const html = buildReportHtml(scores, manifest, overrides, {
      siblingJudges: judges.filter((j) => j !== scores.judgeModel),
      imageBase: SCREENSHOTS_DIR,
      comparisonHref: "comparison.html",
      readOnly: true,
    });
    await writeFile(join(outDir, `report.${modelDirName(scores.judgeModel)}.html`), html, "utf8");
    if (scores.judgeModel === defaultJudge) {
      await writeFile(join(outDir, "index.html"), html, "utf8");
    }
  }

  if (hasComparison) {
    const comparison = buildJudgeComparison(scoresList, manifest);
    await writeFile(
      join(outDir, "comparison.html"),
      buildComparisonHtml(comparison, { backHref: "index.html" }),
      "utf8",
    );
  }

  for (const entry of manifest.entries) {
    await copyFile(
      join(datasetDir(), entry.filename),
      join(outDir, SCREENSHOTS_DIR, entry.filename),
    );
  }

  return { outDir, judges, screenshots: manifest.entries.length };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      // Explicit default rather than resolveDatasetRef(): BENCH_DATASET often
      // names the private dataset, and publishing must never follow it.
      dataset: { type: "string", default: "golden" },
      out: { type: "string", default: "_site" },
    },
  });
  assertPublishable(values.dataset);
  const dataset = selectDataset(values.dataset);
  console.log(`Dataset: ${dataset.id} (${dataset.dir})`);
  const summary = await buildSite(resolve(values.out));
  console.log(
    `Wrote ${summary.judges.length} judge report(s) and ${summary.screenshots} screenshot(s) -> ${summary.outDir}`,
  );
}

const isDirectRun = process.argv[1]?.endsWith("site.ts") ?? false;
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
