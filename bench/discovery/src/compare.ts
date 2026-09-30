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
  /** What the model reported in each rep (keyed by rep number), for the detail view. */
  reportedByRep: Record<string, string[]>;
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
          // Every judge scored the same run records, so any judge's cells carry the reports.
          const reportedByRep: Record<string, string[]> = {};
          for (const c of scoresList[0]?.cells ?? []) {
            if (c.series === series && c.imageId === entry.imageId) {
              reportedByRep[String(c.rep)] = c.reportedIssues.map((i) => i.description);
            }
          }
          disagreements.push({
            model: series,
            imageId: entry.imageId,
            filename: entry.filename,
            expectedIndex,
            expectedText: entry.expectedIssues[expectedIndex] ?? "",
            perJudge,
            reportedByRep,
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
 * Outvoted verdicts per rep: the judges on the losing side of the found/missed
 * vote. A 4-1 split counts 1 and a 3-2 split counts 2, so closer splits weigh
 * more; a unanimous rep counts 0 and is left out.
 */
export function outvotedByRep(d: Disagreement): Map<number, number> {
  const votes = new Map<number, { found: number; total: number }>();
  for (const verdicts of Object.values(d.perJudge)) {
    for (const v of verdicts) {
      const tally = votes.get(v.rep) ?? { found: 0, total: 0 };
      tally.total++;
      if (v.found) tally.found++;
      votes.set(v.rep, tally);
    }
  }
  const outvoted = new Map<number, number>();
  for (const [rep, { found, total }] of [...votes].sort((a, b) => a[0] - b[0])) {
    const minority = Math.min(found, total - found);
    if (minority > 0) outvoted.set(rep, minority);
  }
  return outvoted;
}

export interface HeatCell {
  series: string;
  imageId: string;
  /** Reps in which the judges split on at least one expected defect. */
  splitReps: number;
  /** Outvoted verdicts summed over reps and expected defects. */
  outvoted: number;
}

/** Disagreement per screenshot × model cell, keyed `${series} ${imageId}`. Cells with none are absent. */
export function disagreementHeat(comparison: JudgeComparison): Map<string, HeatCell> {
  const heat = new Map<string, HeatCell & { reps: Set<number> }>();
  for (const d of comparison.disagreements) {
    const key = `${d.model} ${d.imageId}`;
    const cell = heat.get(key) ?? {
      series: d.model,
      imageId: d.imageId,
      splitReps: 0,
      outvoted: 0,
      reps: new Set<number>(),
    };
    for (const [rep, n] of outvotedByRep(d)) {
      cell.reps.add(rep);
      cell.outvoted += n;
    }
    cell.splitReps = cell.reps.size;
    heat.set(key, cell);
  }
  return new Map(
    [...heat].map(([key, { series, imageId, splitReps, outvoted }]) => [
      key,
      { series, imageId, splitReps, outvoted },
    ]),
  );
}

/**
 * Render the judge comparison as a standalone page for the published site,
 * where a markdown file would be served as raw text: a screenshot × model
 * heatmap of where the judges disagree, the per-model metric table, and one
 * section per disagreement. Every string is escaped, since reasonings and
 * reported issues are model-authored text.
 */
export function buildComparisonHtml(
  comparison: JudgeComparison,
  options: { backHref: string; imageBase?: string },
): string {
  const e = escapeHtml;
  const imageBase = options.imageBase?.replace(/\/+$/, "");
  const heat = disagreementHeat(comparison);
  const maxOutvoted = Math.max(1, ...[...heat.values()].map((h) => h.outvoted));
  const repCount = Math.max(
    1,
    ...comparison.disagreements.flatMap((d) =>
      Object.values(d.perJudge).flatMap((vs) => vs.map((v) => v.rep)),
    ),
  );

  // Columns: models ordered by total disagreement, most contested first.
  const seriesIndex = new Map(comparison.perModel.map((r, i) => [r.model, i]));
  const colTotal = (series: string): number =>
    [...heat.values()].filter((h) => h.series === series).reduce((n, h) => n + h.outvoted, 0);
  const columns = comparison.perModel
    .map((r) => r.model)
    .sort((a, b) => colTotal(b) - colTotal(a) || a.localeCompare(b));
  // Rows: screenshots with at least one disagreement, in manifest order.
  const images = [...new Map(comparison.disagreements.map((d) => [d.imageId, d])).values()];
  const anchor = (series: string, imageId: string): string =>
    `d-${seriesIndex.get(series) ?? 0}-${imageId}`;
  const shade = (outvoted: number): string => {
    const alpha = 0.15 + (0.75 * outvoted) / maxOutvoted;
    return `background:rgba(220,38,38,${alpha.toFixed(2)});${alpha > 0.5 ? "color:#fff;" : ""}`;
  };

  const heatHead = `<tr><th class="rowhead">Screenshot</th>${columns
    .map((s) => `<th class="col"><span>${e(s)}</span></th>`)
    .join("")}<th class="col"><span>total</span></th></tr>`;
  const heatRows = images.map((d) => {
    const cells = columns.map((series) => {
      const h = heat.get(`${series} ${d.imageId}`);
      if (!h) return `<td class="heat"></td>`;
      const title = `${d.imageId} × ${series}: ${h.splitReps} of ${repCount} reps split, ${h.outvoted} outvoted verdicts`;
      return `<td class="heat" data-outvoted="${h.outvoted}" style="${shade(h.outvoted)}" title="${e(title)}"><a href="#${anchor(series, d.imageId)}">${h.outvoted}</a></td>`;
    });
    const rowTotal = [...heat.values()]
      .filter((h) => h.imageId === d.imageId)
      .reduce((n, h) => n + h.outvoted, 0);
    return `<tr><th class="rowhead">${e(d.imageId)} <span class="muted">${e(d.filename)}</span><br><span class="muted">${e(truncateDescription(d.expectedText))}</span></th>${cells.join("")}<td class="total">${rowTotal}</td></tr>`;
  });
  const heatFoot = `<tr><th class="rowhead">total</th>${columns
    .map((s) => `<td class="total">${colTotal(s) || ""}</td>`)
    .join(
      "",
    )}<td class="total">${[...heat.values()].reduce((n, h) => n + h.outvoted, 0)}</td></tr>`;

  const metricHeader = [
    "Model",
    ...comparison.judges.flatMap((j) => [`${j} recall`, `${j} extras/run`]),
    "Recall Δ",
  ];
  const metricRows = comparison.perModel.map((row) => {
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

  // Disagreement sections, most outvoted first. The first section of each
  // (model, screenshot) pair carries the anchor its heatmap cell links to.
  const anchored = new Set<string>();
  const sections = [...comparison.disagreements]
    .map((d) => ({ d, outvoted: [...outvotedByRep(d).values()].reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.outvoted - a.outvoted)
    .map(({ d, outvoted }) => {
      const pairKey = `${d.model} ${d.imageId}`;
      const id = anchored.has(pairKey) ? "" : ` id="${anchor(d.model, d.imageId)}"`;
      anchored.add(pairKey);
      const reps = [
        ...new Set(Object.values(d.perJudge).flatMap((vs) => vs.map((v) => v.rep))),
      ].sort((a, b) => a - b);
      const split = outvotedByRep(d);
      const grid = comparison.judges.map((judge) => {
        const byRep = new Map((d.perJudge[judge] ?? []).map((v) => [v.rep, v]));
        const chips = reps.map((rep) => {
          const v = byRep.get(rep);
          if (!v) return `<td class="na">–</td>`;
          return `<td class="${v.found ? "found" : "missed"}${split.has(rep) ? " split" : ""}" title="${e(v.reasoning)}">${v.found ? "✓ found" : "✗ missed"}</td>`;
        });
        return `<tr><th>${e(judge)}</th>${chips.join("")}</tr>`;
      });
      const reasoning = comparison.judges
        .flatMap((judge) =>
          (d.perJudge[judge] ?? [])
            .filter((v) => split.has(v.rep))
            .map((v) => `<li><strong>${e(judge)}</strong>, rep ${v.rep}: ${e(v.reasoning)}</li>`),
        )
        .join("");
      const reported = reps
        .filter((rep) => split.has(rep))
        .map((rep) => {
          const issues = d.reportedByRep[String(rep)] ?? [];
          return `<li>rep ${rep}<ol start="0">${issues.map((t) => `<li>${e(t)}</li>`).join("")}</ol></li>`;
        })
        .join("");
      const shot = imageBase
        ? `<img src="${e(imageBase)}/${e(d.filename)}" alt="${e(d.imageId)}" loading="lazy">`
        : "";
      return `<section class="disagreement"${id}>
${shot}<h3>${e(d.imageId)} ${e(d.filename)} — ${e(d.model)} <span class="badge" style="${shade(outvoted)}">${outvoted} outvoted</span></h3>
<p class="muted">Expected: ${e(d.expectedText)}</p>
<table class="verdicts"><thead><tr><th>Judge</th>${reps.map((r) => `<th>rep ${r}</th>`).join("")}</tr></thead><tbody>${grid.join("")}</tbody></table>
<details><summary>Judge reasoning on the split reps</summary><ul>${reasoning}</ul></details>
<details><summary>What the model reported in the split reps</summary><ul>${reported}</ul></details>
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
  .muted { color: var(--muted); font-weight: 400; font-size: 12px; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; background: #fff; }
  th, td { border: 1px solid var(--line); padding: 6px 10px; text-align: right; white-space: nowrap; }
  th { background: #f3f4f6; }
  th:first-child, td:first-child { text-align: left; }
  #heatmap th.col { vertical-align: bottom; padding: 6px 4px; }
  #heatmap th.col span { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; font-weight: 500; }
  #heatmap th.rowhead { text-align: left; white-space: normal; min-width: 220px; max-width: 280px; font-weight: 600; }
  #heatmap td.heat { width: 30px; min-width: 30px; text-align: center; padding: 0; }
  #heatmap td.heat a { display: block; padding: 6px 0; color: inherit; text-decoration: none; font-weight: 600; }
  #heatmap td.total { color: var(--muted); text-align: center; }
  .legend { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); margin: 8px 0; }
  .legend .ramp { width: 160px; height: 12px; border-radius: 2px; background: linear-gradient(90deg, rgba(220,38,38,0.15), rgba(220,38,38,0.9)); }
  .disagreement { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; margin: 12px 0; overflow: hidden; }
  .disagreement:target { outline: 3px solid var(--accent); }
  .disagreement img { float: right; max-width: 200px; max-height: 260px; margin: 0 0 8px 16px; border: 1px solid var(--line); border-radius: 4px; }
  .disagreement p { margin: 0 0 8px; }
  .disagreement ul { margin: 4px 0; padding-left: 20px; }
  .badge { display: inline-block; border-radius: 4px; padding: 1px 6px; font-size: 11px; margin-left: 6px; }
  table.verdicts td { text-align: center; font-size: 12px; }
  table.verdicts td.found { color: var(--ok); } table.verdicts td.missed { color: var(--bad); }
  table.verdicts td.split { background: #fef2f2; font-weight: 600; }
  details { margin-top: 6px; } summary { cursor: pointer; color: var(--accent); font-size: 13px; }
</style>
</head>
<body>
<main>
<p><a href="${e(options.backHref)}">← Back to the report</a></p>
<h1>Judge comparison</h1>
<p>Judges compared: ${comparison.judges.map((j) => `<code>${e(j)}</code>`).join(" vs ")}</p>
<h2>Where the judges disagree</h2>
<p class="muted">Each cell is one model on one screenshot. The number is how many found/missed verdicts were outvoted, summed over its reps: a rep where the judges split 4-1 adds 1, a 3-2 split adds 2. Darker means more disagreement. Models are ordered most contested first; click a cell for its verdicts.</p>
<div class="legend"><span>fewer</span><span class="ramp"></span><span>more outvoted verdicts (max ${maxOutvoted})</span></div>
${heat.size === 0 ? "<p>The judges agree on every non-overridden cell.</p>" : `<div class="scroll"><table id="heatmap"><thead>${heatHead}</thead><tbody>${heatRows.join("")}</tbody><tfoot>${heatFoot}</tfoot></table></div>`}
<h2>Per-model metrics by judge</h2>
<div class="scroll"><table>
<thead><tr>${metricHeader.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead>
<tbody>${metricRows.join("\n")}</tbody>
</table></div>
<h2>Disagreements (${comparison.disagreements.length})</h2>
<p class="muted">Most outvoted first. Hover a verdict for the judge's reasoning; split reps are shaded.</p>
${sections.join("\n")}
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
