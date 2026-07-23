import type { Manifest, ResolvedCell, Scores } from "./types.js";
import { truncateDescription } from "./matrix.js";

interface JudgeModelStats {
  meanRecall: number | null;
  extrasPerRun: number | null;
}

export interface ComparisonModelRow {
  model: string;
  byJudge: Record<string, JudgeModelStats>;
  /** Max meanRecall minus min meanRecall across judges (null if any judge lacks it). */
  recallDelta: number | null;
}

export interface RepVerdict {
  rep: number;
  found: boolean;
  reasoning: string;
}

export interface Disagreement {
  model: string;
  imageId: string;
  filename: string;
  expectedIndex: number;
  expectedText: string;
  perJudge: Record<string, RepVerdict[]>;
}

export interface JudgeComparison {
  judges: string[];
  perModel: ComparisonModelRow[];
  disagreements: Disagreement[];
  /** Cells excluded because an override forces agreement regardless of judge. */
  overriddenExcluded: number;
}

function repKey(cell: Pick<ResolvedCell, "model" | "imageId" | "rep">): string {
  return `${cell.model} ${cell.imageId} ${cell.rep}`;
}

function verdictVector(
  cells: readonly ResolvedCell[],
  model: string,
  imageId: string,
  expectedIndex: number,
  excludedReps: ReadonlySet<string>,
): RepVerdict[] {
  return cells
    .filter(
      (c) =>
        c.model === model &&
        c.imageId === imageId &&
        c.status === "ok" &&
        !excludedReps.has(repKey(c)),
    )
    .map((c) => {
      const entry = c.expected.find((e) => e.expectedIndex === expectedIndex);
      return entry ? { rep: c.rep, found: entry.found, reasoning: entry.reasoning } : undefined;
    })
    .filter((v): v is RepVerdict => v !== undefined)
    .sort((a, b) => a.rep - b.rep);
}

/** Compare how ≥2 judges scored the same run records. */
export function buildJudgeComparison(
  scoresList: readonly Scores[],
  manifest: Manifest,
): JudgeComparison {
  if (scoresList.length < 2) {
    throw new Error(`Judge comparison needs at least two judges, got ${scoresList.length}`);
  }
  const judges = scoresList.map((s) => s.judgeModel);

  // Per-model metric table across judges.
  const modelNames = [...new Set(scoresList.flatMap((s) => s.models.map((m) => m.model)))].sort(
    (a, b) => a.localeCompare(b),
  );
  const perModel: ComparisonModelRow[] = modelNames.map((model) => {
    const byJudge: Record<string, JudgeModelStats> = {};
    for (const scores of scoresList) {
      const metrics = scores.models.find((m) => m.model === model);
      byJudge[scores.judgeModel] = {
        meanRecall: metrics?.meanRecall ?? null,
        extrasPerRun: metrics?.extrasPerRun ?? null,
      };
    }
    const recalls = judges.map((j) => byJudge[j]?.meanRecall ?? null);
    const recallDelta = recalls.some((r) => r === null)
      ? null
      : Math.max(...(recalls as number[])) - Math.min(...(recalls as number[]));
    return { model, byJudge, recallDelta };
  });

  // Disagreements: per (model, image, expectedIndex) where found vectors differ.
  // A rep overridden under any judge is excluded from every judge's vector —
  // overrides are judge-independent ground truth and would fake (dis)agreement.
  const disagreements: Disagreement[] = [];
  const overriddenKeys = new Set<string>();
  for (const scores of scoresList) {
    for (const cell of scores.cells) {
      if (cell.overridden) overriddenKeys.add(repKey(cell));
    }
  }
  const overriddenExcluded = overriddenKeys.size;

  const models = [...new Set(scoresList.flatMap((s) => s.cells.map((c) => c.model)))].sort((a, b) =>
    a.localeCompare(b),
  );
  for (const entry of manifest.entries) {
    for (const model of models) {
      for (let expectedIndex = 0; expectedIndex < entry.expectedIssues.length; expectedIndex++) {
        const perJudge: Record<string, RepVerdict[]> = {};
        for (const scores of scoresList) {
          perJudge[scores.judgeModel] = verdictVector(
            scores.cells,
            model,
            entry.imageId,
            expectedIndex,
            overriddenKeys,
          );
        }
        const vectors = judges.map((j) =>
          (perJudge[j] ?? []).map((v) => `${v.rep}:${v.found ? 1 : 0}`).join(","),
        );
        if (new Set(vectors).size > 1) {
          disagreements.push({
            model,
            imageId: entry.imageId,
            filename: entry.filename,
            expectedIndex,
            expectedText: entry.expectedIssues[expectedIndex] ?? "",
            perJudge,
          });
        }
      }
    }
  }

  return { judges, perModel, disagreements, overriddenExcluded };
}

function pct(value: number | null): string {
  return value === null ? "–" : `${(value * 100).toFixed(0)}%`;
}

function num(value: number | null): string {
  return value === null ? "–" : value.toFixed(1);
}

/** Render the judge comparison as a standalone markdown document. */
export function buildComparisonMarkdown(comparison: JudgeComparison): string {
  const lines: string[] = [
    "# Judge comparison",
    "",
    "<!-- Generated by bench:report. Do not edit. -->",
    "",
    `Judges compared: ${comparison.judges.map((j) => `\`${j}\``).join(" vs ")}`,
    "",
    "## Per-model metrics by judge",
    "",
  ];

  const header = [
    "Model",
    ...comparison.judges.flatMap((j) => [`${j} recall`, `${j} extras/run`]),
    "Recall Δ",
  ];
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);
  for (const row of comparison.perModel) {
    const cells = [
      row.model,
      ...comparison.judges.flatMap((j) => [
        pct(row.byJudge[j]?.meanRecall ?? null),
        num(row.byJudge[j]?.extrasPerRun ?? null),
      ]),
      row.recallDelta === null ? "–" : pct(row.recallDelta),
    ];
    lines.push(`| ${cells.join(" | ")} |`);
  }

  lines.push("", `## Disagreements (${comparison.disagreements.length})`, "");
  if (comparison.disagreements.length === 0) {
    lines.push("The judges agree on every non-overridden cell.");
  }
  for (const d of comparison.disagreements) {
    lines.push(
      `### ${d.imageId} ${d.filename} — ${d.model}`,
      "",
      `Expected: ${truncateDescription(d.expectedText)}`,
      "",
    );
    for (const judge of comparison.judges) {
      const verdicts = d.perJudge[judge] ?? [];
      const chips = verdicts.map((v) => `rep ${v.rep}: ${v.found ? "found" : "missed"}`).join(", ");
      lines.push(`- **${judge}**: ${chips || "no verdicts"}`);
      for (const v of verdicts) {
        lines.push(`  - rep ${v.rep}: ${v.reasoning}`);
      }
    }
    lines.push("");
  }

  if (comparison.overriddenExcluded > 0) {
    lines.push(
      `> ${comparison.overriddenExcluded} manually overridden run(s) excluded — overrides force agreement regardless of judge.`,
      "",
    );
  }

  return lines.join("\n");
}
