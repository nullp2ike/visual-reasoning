import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { PROMPT_VARIANT_IDS } from "../bench.config.js";
import { EMBED_JUDGE_PREFIX, cosine, embedModelRepo, loadEmbedder } from "./embed.js";
import { ensureManifest } from "./manifest.js";
import { ScoresSchema, type Scores } from "./types.js";
import { RESULTS_DIR, readJsonIfExists, scoresPathForVariantJudge } from "./util.js";

export const CALIBRATION_MD_PATH = join(RESULTS_DIR, "EMBED_CALIBRATION.md");

/** One expected-issue example: its max cosine to any reported issue, and the LLM label. */
interface Example {
  maxSim: number;
  found: boolean;
}

interface ThresholdRow {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
}

/**
 * Build calibration examples from an LLM judge's resolved cells. Each ok cell
 * contributes one example per expected issue that has at least one reported issue
 * to compare against (cells with no reported issues are trivially "not found" and
 * carry no threshold information). The expected/reported texts are embedded and
 * reduced to the max cosine similarity between the expected issue and any report;
 * the LLM judge's `found` is the ground-truth label.
 */
export async function buildExamples(
  scoresList: readonly Scores[],
  expectedByImage: ReadonlyMap<string, readonly string[]>,
  embed: (texts: readonly string[]) => Promise<number[][]>,
): Promise<Example[]> {
  // Dedupe every text so each is embedded exactly once.
  const texts = new Set<string>();
  for (const scores of scoresList) {
    for (const cell of scores.cells) {
      if (cell.status !== "ok") continue;
      for (const text of expectedByImage.get(cell.imageId) ?? []) texts.add(text);
      for (const issue of cell.reportedIssues) texts.add(issue.description);
    }
  }
  const unique = [...texts];
  const vectors = await embedInBatches(unique, embed);
  const vecOf = new Map<string, number[]>(unique.map((t, i) => [t, vectors[i] ?? []]));

  const examples: Example[] = [];
  for (const scores of scoresList) {
    for (const cell of scores.cells) {
      if (cell.status !== "ok") continue;
      const reportedVecs = cell.reportedIssues.map((i) => vecOf.get(i.description) ?? []);
      if (reportedVecs.length === 0) continue;
      const expectedTexts = expectedByImage.get(cell.imageId) ?? [];
      for (const entry of cell.expected) {
        const text = expectedTexts[entry.expectedIndex];
        if (text === undefined) continue;
        const self = vecOf.get(text) ?? [];
        const maxSim = Math.max(...reportedVecs.map((v) => cosine(self, v)));
        examples.push({ maxSim, found: entry.found });
      }
    }
  }
  return examples;
}

async function embedInBatches(
  texts: readonly string[],
  embed: (texts: readonly string[]) => Promise<number[][]>,
  batchSize = 128,
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    out.push(...(await embed(texts.slice(i, i + batchSize))));
  }
  return out;
}

/** Precision/recall/F1/accuracy of `maxSim >= threshold` against the `found` labels. */
export function scoreThreshold(examples: readonly Example[], threshold: number): ThresholdRow {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const ex of examples) {
    const predicted = ex.maxSim >= threshold;
    if (predicted && ex.found) tp++;
    else if (predicted && !ex.found) fp++;
    else if (!predicted && ex.found) fn++;
    else tn++;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const accuracy = examples.length === 0 ? 0 : (tp + tn) / examples.length;
  return { threshold, precision, recall, f1, accuracy };
}

/** Sweep thresholds and return every row plus the F1-optimal one (ties break toward precision). */
export function sweepThresholds(
  examples: readonly Example[],
  from = 0.3,
  to = 0.95,
  step = 0.01,
): { rows: ThresholdRow[]; best: ThresholdRow } {
  const rows: ThresholdRow[] = [];
  for (let t = from; t <= to + 1e-9; t += step) {
    rows.push(scoreThreshold(examples, Math.round(t * 100) / 100));
  }
  const best = rows.reduce((a, b) =>
    b.f1 > a.f1 || (b.f1 === a.f1 && b.threshold > a.threshold) ? b : a,
  );
  return { rows, best };
}

function buildMarkdown(
  groundTruthJudge: string,
  embedJudge: string,
  variants: readonly string[],
  examples: readonly Example[],
  rows: readonly ThresholdRow[],
  best: ThresholdRow,
): string {
  const positives = examples.filter((e) => e.found).length;
  const fmt = (n: number): string => n.toFixed(3);
  const near = rows.filter((r) => Math.abs(r.threshold - best.threshold) <= 0.05);
  const lines = [
    "# Embedding judge threshold calibration",
    "",
    `- **Embedding judge:** \`${embedJudge}\``,
    `- **Ground-truth judge:** \`${groundTruthJudge}\``,
    `- **Prompt variants pooled:** ${variants.join(", ")}`,
    `- **Examples (expected issues with >=1 reported issue):** ${examples.length} ` +
      `(${positives} found / ${examples.length - positives} not found)`,
    `- **F1-optimal threshold:** \`${best.threshold.toFixed(2)}\` ` +
      `(precision ${fmt(best.precision)}, recall ${fmt(best.recall)}, F1 ${fmt(best.f1)}, accuracy ${fmt(best.accuracy)})`,
    "",
    "Set `EMBED_DEFAULT_THRESHOLD` in `bench/src/embed.ts` to the value above " +
      "(override per run with `--embed-threshold`).",
    "",
    "## Thresholds near the optimum",
    "",
    "| threshold | precision | recall | F1 | accuracy |",
    "| --- | --- | --- | --- | --- |",
    ...near.map(
      (r) =>
        `| ${r.threshold.toFixed(2)} | ${fmt(r.precision)} | ${fmt(r.recall)} | ${fmt(r.f1)} | ${fmt(r.accuracy)} |`,
    ),
    "",
  ];
  return lines.join("\n") + "\n";
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      judge: { type: "string" },
      model: { type: "string" },
    },
  });
  const groundTruthJudge = values.judge ?? "gpt-5.6-terra";
  const embedId = values.model ?? "bge-small";
  const embedJudge = `${EMBED_JUDGE_PREFIX}${embedId}`;

  const manifest = await ensureManifest();
  const expectedByImage = new Map(manifest.entries.map((e) => [e.imageId, e.expectedIssues]));

  // Pool every prompt variant we have scores for under the ground-truth judge.
  const scoresList: Scores[] = [];
  const variants: string[] = [];
  for (const variant of PROMPT_VARIANT_IDS) {
    const raw = await readJsonIfExists(scoresPathForVariantJudge(variant, groundTruthJudge));
    if (raw === undefined) continue;
    scoresList.push(ScoresSchema.parse(raw));
    variants.push(variant);
  }
  if (scoresList.length === 0) {
    throw new Error(
      `No scores found for judge "${groundTruthJudge}". Run "pnpm bench:score --judge ${groundTruthJudge}" first.`,
    );
  }

  console.log(`Loading embedding model for ${embedJudge} (first run downloads it)...`);
  const embed = await loadEmbedder(embedModelRepo(embedJudge));

  console.log(
    `Embedding calibration texts from ${variants.join(", ")} (judge: ${groundTruthJudge})...`,
  );
  const examples = await buildExamples(scoresList, expectedByImage, embed);
  if (examples.length === 0) throw new Error("No calibration examples found.");

  const { rows, best } = sweepThresholds(examples);
  const markdown = buildMarkdown(groundTruthJudge, embedJudge, variants, examples, rows, best);
  await writeFile(CALIBRATION_MD_PATH, markdown, "utf8");

  console.log(markdown);
  console.log(
    `Best F1 threshold ${best.threshold.toFixed(2)} -> set EMBED_DEFAULT_THRESHOLD in bench/src/embed.ts`,
  );
  console.log(`Wrote ${CALIBRATION_MD_PATH}`);
}

const isDirectRun = process.argv[1]?.endsWith("calibrate-embed.ts") ?? false;
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
