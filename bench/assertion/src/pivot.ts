import type { CallMode, VisibilityScores } from "./types.js";

/** One model's column in a pivot row. */
export interface PivotCell {
  /** Files in which this statement was graded and at least one rep answered wrongly. */
  failingFiles: number;
  /** Files in which this statement was graded for this series at all. */
  files: number;
  /** The failing files, worst first, for the drill-down. */
  failing: { filename: string; correct: number; total: number }[];
}

export interface PivotRow {
  statement: string;
  /** Which prompt asked it. Normally one; two if a dataset moves it between sections. */
  askedAs: CallMode[];
  /** Keyed by series, in leaderboard order. */
  cells: Record<string, PivotCell>;
  /** Highest `failingFiles` across series — the sort key. */
  maxFailing: number;
}

interface Tally {
  correct: number;
  total: number;
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, make: () => V): V {
  const existing = map.get(key);
  if (existing !== undefined) return existing;
  const created = make();
  map.set(key, created);
  return created;
}

/**
 * Pivot the graded cells by statement text: one row per bullet wording, one
 * column per model, each cell counting the *files* in which that wording drew
 * at least one wrong answer.
 *
 * The consistency grid answers "how did this element do on this image?". This
 * answers "how does this wording do everywhere it appears?", which is the
 * question behind a ground-truth audit. A bullet failing across many files is
 * almost always the wording rather than the models; one failing on a single
 * file is the model, or that file's label.
 *
 * Counting files rather than reps keeps the number comparable across bullets
 * that appear in different numbers of files.
 */
export function buildStatementPivot(scores: VisibilityScores): PivotRow[] {
  // statement -> series -> filename -> tally
  const tally = new Map<string, Map<string, Map<string, Tally>>>();
  for (const cell of scores.cells) {
    if (cell.status !== "ok") continue;
    for (const element of cell.elements) {
      const bySeries = getOrCreate(
        tally,
        element.element,
        () => new Map<string, Map<string, Tally>>(),
      );
      const byFile = getOrCreate(bySeries, cell.series, () => new Map<string, Tally>());
      const t = getOrCreate(byFile, cell.filename, () => ({ correct: 0, total: 0 }));
      t.total += 1;
      if (element.correct) t.correct += 1;
    }
  }

  const askedAs = new Map<string, Set<CallMode>>();
  for (const image of scores.images) {
    for (const el of image.visibleCall) getOrCreate(askedAs, el, () => new Set()).add("visible");
    for (const el of image.hiddenCall) getOrCreate(askedAs, el, () => new Set()).add("hidden");
  }

  const seriesOrder = scores.models.map((m) => m.series);
  const rows: PivotRow[] = [];
  for (const [statement, bySeries] of tally) {
    const cells: Record<string, PivotCell> = {};
    let maxFailing = 0;
    for (const series of seriesOrder) {
      const byFile = bySeries.get(series);
      if (!byFile) {
        cells[series] = { failingFiles: 0, files: 0, failing: [] };
        continue;
      }
      const failing = [...byFile.entries()]
        .filter(([, t]) => t.correct < t.total)
        .map(([filename, t]) => ({ filename, correct: t.correct, total: t.total }))
        .sort(
          (a, b) =>
            a.correct / a.total - b.correct / b.total || a.filename.localeCompare(b.filename),
        );
      cells[series] = { failingFiles: failing.length, files: byFile.size, failing };
      maxFailing = Math.max(maxFailing, failing.length);
    }
    rows.push({
      statement,
      askedAs: [...(askedAs.get(statement) ?? [])].sort(),
      cells,
      maxFailing,
    });
  }

  rows.sort((a, b) => b.maxFailing - a.maxFailing || a.statement.localeCompare(b.statement));
  return rows;
}
