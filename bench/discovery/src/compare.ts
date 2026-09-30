import type { Manifest, ResolvedCell, Scores } from "./types.js";
import { escapeHtml } from "./html.js";
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

function repKey(cell: Pick<ResolvedCell, "series" | "imageId" | "rep">): string {
  return `${cell.series} ${cell.imageId} ${cell.rep}`;
}

function verdictVector(
  cells: readonly ResolvedCell[],
  series: string,
  imageId: string,
  expectedIndex: number,
  excludedReps: ReadonlySet<string>,
): RepVerdict[] {
  return cells
    .filter(
      (c) =>
        c.series === series &&
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

  // Per-series metric table across judges (one row per model × effort).
  const seriesNames = [...new Set(scoresList.flatMap((s) => s.models.map((m) => m.series)))].sort(
    (a, b) => a.localeCompare(b),
  );
  const perModel: ComparisonModelRow[] = seriesNames.map((series) => {
    const byJudge: Record<string, JudgeModelStats> = {};
    for (const scores of scoresList) {
      const metrics = scores.models.find((m) => m.series === series);
      byJudge[scores.judgeModel] = {
        meanRecall: metrics?.meanRecall ?? null,
        extrasPerRun: metrics?.extrasPerRun ?? null,
      };
    }
    const recalls = judges.map((j) => byJudge[j]?.meanRecall ?? null);
    const recallDelta = recalls.some((r) => r === null)
      ? null
      : Math.max(...(recalls as number[])) - Math.min(...(recalls as number[]));
    return { model: series, byJudge, recallDelta };
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

  const seriesList = [...new Set(scoresList.flatMap((s) => s.cells.map((c) => c.series)))].sort(
    (a, b) => a.localeCompare(b),
  );
  for (const entry of manifest.entries) {
    for (const series of seriesList) {
      for (let expectedIndex = 0; expectedIndex < entry.expectedIssues.length; expectedIndex++) {
        const perJudge: Record<string, RepVerdict[]> = {};
        for (const scores of scoresList) {
          perJudge[scores.judgeModel] = verdictVector(
            scores.cells,
            series,
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
            model: series,
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
    "<!-- Generated by discovery:report. Do not edit. -->",
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

/**
 * Render the judge comparison as a standalone page for the published site,
 * where a markdown file would be served as raw text. Same content as
 * buildComparisonMarkdown; every string is escaped, since reasonings and
 * expected issues are model- and dataset-authored text.
 */
export function buildComparisonHtml(
  comparison: JudgeComparison,
  options: { backHref: string },
): string {
  const e = escapeHtml;
  const header = [
    "Model",
    ...comparison.judges.flatMap((j) => [`${j} recall`, `${j} extras/run`]),
    "Recall Δ",
  ];
  const rows = comparison.perModel.map((row) => {
    const cells = [
      row.model,
      ...comparison.judges.flatMap((j) => [
        pct(row.byJudge[j]?.meanRecall ?? null),
        num(row.byJudge[j]?.extrasPerRun ?? null),
      ]),
      row.recallDelta === null ? "–" : pct(row.recallDelta),
    ];
    return `<tr>${cells.map((c) => `<td>${e(c)}</td>`).join("")}</tr>`;
  });

  const disagreements = comparison.disagreements.map((d) => {
    const judges = comparison.judges.map((judge) => {
      const verdicts = d.perJudge[judge] ?? [];
      const reps = verdicts
        .map(
          (v) =>
            `<li><span class="${v.found ? "found" : "missed"}">rep ${v.rep}: ${v.found ? "found" : "missed"}</span> ${e(v.reasoning)}</li>`,
        )
        .join("");
      return `<li><strong>${e(judge)}</strong>${reps ? `<ul>${reps}</ul>` : " no verdicts"}</li>`;
    });
    return `<section class="disagreement">
<h3>${e(d.imageId)} ${e(d.filename)} — ${e(d.model)}</h3>
<p>Expected: ${e(truncateDescription(d.expectedText))}</p>
<ul>${judges.join("")}</ul>
</section>`;
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Defect discovery benchmark — judge comparison</title>
<style>
  :root { --ok: #15803d; --bad: #b91c1c; --muted: #6b7280; --line: #e5e7eb; --accent: #1d4ed8; }
  body { font: 14px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; color: #111827; background: #fafafa; }
  main { max-width: 1400px; margin: 0 auto; padding: 24px 16px; }
  h1 { font-size: 22px; } h2 { font-size: 18px; margin-top: 32px; } h3 { font-size: 15px; margin: 0 0 4px; }
  a { color: var(--accent); }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; background: #fff; }
  th, td { border: 1px solid var(--line); padding: 6px 10px; text-align: right; white-space: nowrap; }
  th { background: #f3f4f6; }
  th:first-child, td:first-child { text-align: left; }
  .disagreement { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; margin: 12px 0; }
  .disagreement p { margin: 0 0 6px; color: var(--muted); }
  .disagreement ul { margin: 4px 0; padding-left: 20px; }
  .found { color: var(--ok); font-weight: 600; } .missed { color: var(--bad); font-weight: 600; }
</style>
</head>
<body>
<main>
<p><a href="${e(options.backHref)}">← Back to the report</a></p>
<h1>Judge comparison</h1>
<p>Judges compared: ${comparison.judges.map((j) => `<code>${e(j)}</code>`).join(" vs ")}</p>
<h2>Per-model metrics by judge</h2>
<div class="scroll"><table>
<thead><tr>${header.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead>
<tbody>${rows.join("\n")}</tbody>
</table></div>
<h2>Disagreements (${comparison.disagreements.length})</h2>
${comparison.disagreements.length === 0 ? "<p>The judges agree on every non-overridden cell.</p>" : disagreements.join("\n")}
${
  comparison.overriddenExcluded > 0
    ? `<p>${comparison.overriddenExcluded} manually overridden run(s) excluded — overrides force agreement regardless of judge.</p>`
    : ""
}
</main>
</body>
</html>
`;
}
