import { mean, median, percentile, seriesId } from "../../src/util.js";
import { isRecordCurrent } from "./records.js";
import type {
  GradedCell,
  GradedElement,
  VisibilityImage,
  VisibilityModelMetrics,
  VisibilityRunRecord,
  VisibilityScores,
} from "./types.js";

/**
 * Tag a series that judged rendering quality, folding into the effort/fidelity
 * parenthetical when there is one: `gemini (xhigh)` -> `gemini (xhigh, correct-rendering)`.
 * The default, presence-only, keeps the bare series id, as primary effort does.
 */
export function renderingSeries(series: string, requireCorrectRendering: boolean): string {
  if (!requireCorrectRendering) return series;
  return series.endsWith(")")
    ? `${series.slice(0, -1)}, correct-rendering)`
    : `${series} (correct-rendering)`;
}

/**
 * Grade one rep against its ground truth. Deterministic: the model's boolean
 * per element is compared with what the ground truth expects. No judge.
 *
 * A rep makes one call per non-empty section, so answers arrive under two
 * different questions. Under the hidden prompt a `pass` means "not visible", so
 * it is inverted into a common "is it on screen?" answer before comparison —
 * which is what lets accuracy and the hallucination rate mean the same thing
 * regardless of which prompt asked.
 *
 * Statements are matched to elements by index, the library's contract
 * (`elementsVisible`/`elementsHidden` build one statement per element, in
 * order). A call returning the wrong number of statements breaks that contract,
 * so the rep is marked `invalid` and excluded from every rate rather than
 * counted as wrong answers.
 */
export function gradeRecord(record: VisibilityRunRecord, image: VisibilityImage): GradedCell {
  if (record.filename !== image.filename) {
    throw new Error(
      `Internal: record for ${record.filename} graded against ground truth for ${image.filename}`,
    );
  }
  const base = {
    series: renderingSeries(
      seriesId(record.model, record.reasoningEffort, record.imageFidelity),
      record.requireCorrectRendering,
    ),
    model: record.model,
    provider: record.provider,
    reasoningEffort: record.reasoningEffort,
    imageFidelity: record.imageFidelity,
    filename: record.filename,
    rep: record.rep,
    usage: record.usage,
  };

  if (record.status === "error" || record.calls.some((c) => c.status === "error" || !c.result)) {
    const failed = record.calls.find((c) => c.status === "error");
    return {
      ...base,
      status: "error",
      elements: [],
      allCorrect: null,
      error:
        record.error ??
        (failed?.error
          ? { name: failed.error.name, message: failed.error.message }
          : { name: "Error", message: "unknown error" }),
    };
  }

  const expectedVisible = new Set(image.expectedVisible);
  const elements: GradedElement[] = [];
  for (const call of record.calls) {
    const statements = call.result?.statements ?? [];
    if (statements.length !== call.elements.length) {
      return {
        ...base,
        status: "invalid",
        invalidReason: `${call.mode} call: expected ${call.elements.length} statements, got ${statements.length}`,
        elements: [],
        allCorrect: null,
      };
    }
    for (const [index, element] of call.elements.entries()) {
      const statement = statements[index];
      if (!statement) throw new Error(`Internal: missing statement at index ${index}`);
      // "X is fully visible" passes when visible; "X is NOT visible" passes when hidden.
      const answeredVisible = call.mode === "visible" ? statement.pass : !statement.pass;
      const expected = expectedVisible.has(element);
      elements.push({
        element,
        askedAs: call.mode,
        expectedVisible: expected,
        answeredVisible,
        correct: expected === answeredVisible,
        confidence: statement.confidence,
        reasoning: statement.reasoning,
        textMismatch: !statement.statement.toLowerCase().includes(element.toLowerCase()),
      });
    }
  }

  return {
    ...base,
    status: "ok",
    elements,
    allCorrect: elements.every((e) => e.correct),
  };
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function accuracyOf(elements: readonly GradedElement[]): number | null {
  return rate(elements.filter((e) => e.correct).length, elements.length);
}

/**
 * Per-series metrics from graded cells. Rates are micro-averaged over element
 * answers in ok runs, so failed and invalid reps shrink the denominator instead
 * of counting as mistakes.
 */
export function computeVisibilityMetrics(
  series: string,
  cells: readonly GradedCell[],
): VisibilityModelMetrics {
  const seriesCells = cells.filter((c) => c.series === series);
  const first = seriesCells[0];
  if (!first) throw new Error(`Internal: no cells for series "${series}"`);
  const okCells = seriesCells.filter((c) => c.status === "ok");
  const answers = okCells.flatMap((c) => c.elements);

  // Flakiness: (image, element) pairs the model answers inconsistently across reps.
  const byPair = new Map<string, { correct: number; total: number }>();
  for (const cell of okCells) {
    for (const element of cell.elements) {
      const key = `${cell.filename} ${element.element}`;
      const entry = byPair.get(key) ?? { correct: 0, total: 0 };
      entry.total++;
      if (element.correct) entry.correct++;
      byPair.set(key, entry);
    }
  }
  const pairRates = [...byPair.values()].map((e) => e.correct / e.total);

  const durations = okCells
    .map((c) => c.usage?.durationSeconds)
    .filter((d): d is number => d !== undefined);
  // Prefer the provider's actual reported cost (OpenRouter) over our local estimate.
  const costs = okCells
    .map((c) => c.usage?.reportedCost ?? c.usage?.estimatedCost)
    .filter((c): c is number => c !== undefined);
  const inputTokens = okCells
    .map((c) => c.usage?.inputTokens)
    .filter((t): t is number => t !== undefined);
  const outputTokens = okCells
    .map((c) => c.usage?.outputTokens)
    .filter((t): t is number => t !== undefined);
  const reasoningTokens = okCells
    .map((c) => c.usage?.reasoningTokens)
    .filter((t): t is number => t !== undefined);

  return {
    series,
    model: first.model,
    provider: first.provider,
    reasoningEffort: first.reasoningEffort,
    imageFidelity: first.imageFidelity,
    okRuns: okCells.length,
    failedRuns: seriesCells.filter((c) => c.status === "error").length,
    invalidRuns: seriesCells.filter((c) => c.status === "invalid").length,
    accuracy: accuracyOf(answers),
    presentRecall: rate(
      answers.filter((e) => e.expectedVisible && e.answeredVisible).length,
      answers.filter((e) => e.expectedVisible).length,
    ),
    absentAccuracy: rate(
      answers.filter((e) => !e.expectedVisible && !e.answeredVisible).length,
      answers.filter((e) => !e.expectedVisible).length,
    ),
    visiblePromptAccuracy: accuracyOf(answers.filter((e) => e.askedAs === "visible")),
    hiddenPromptAccuracy: accuracyOf(answers.filter((e) => e.askedAs === "hidden")),
    allCorrectRate: rate(okCells.filter((c) => c.allCorrect === true).length, okCells.length),
    flakiness:
      pairRates.length === 0
        ? null
        : pairRates.filter((p) => p > 0 && p < 1).length / pairRates.length,
    textMismatches: answers.filter((e) => e.textMismatch).length,
    latencyMedianSeconds: median(durations),
    latencyP95Seconds: percentile(durations, 95),
    meanCostPerRun: mean(costs),
    totalCost: costs.length === 0 ? null : costs.reduce((sum, c) => sum + c, 0),
    meanInputTokens: mean(inputTokens),
    meanOutputTokens: mean(outputTokens),
    meanReasoningTokens: mean(reasoningTokens),
  };
}

/** Nulls sort last in every descending column, so an unscored row never leads. */
function desc(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

/**
 * Rank by overall element accuracy, then by absent accuracy (a model that
 * hallucinates absent elements is worse than one that merely misses present
 * ones), then by the share of fully correct runs.
 */
export function sortVisibilityLeaderboard(
  models: readonly VisibilityModelMetrics[],
): VisibilityModelMetrics[] {
  return [...models].sort(
    (a, b) =>
      desc(a.accuracy, b.accuracy) ||
      desc(a.absentAccuracy, b.absentAccuracy) ||
      desc(a.allCorrectRate, b.allCorrectRate) ||
      a.series.localeCompare(b.series),
  );
}

/**
 * Grade every current record and roll the results up into a scores document.
 * Records whose prompt or image hash no longer matches the ground truth are
 * counted as stale and dropped: grading them would mix answers to two
 * different questions in one number.
 */
export function buildVisibilityScores(
  records: readonly VisibilityRunRecord[],
  images: readonly VisibilityImage[],
  dataset: string,
  now: Date = new Date(),
): VisibilityScores {
  const byFilename = new Map(images.map((i) => [i.filename, i]));
  const cells: GradedCell[] = [];
  let staleRecords = 0;
  for (const record of records) {
    const image = byFilename.get(record.filename);
    if (!image || !isRecordCurrent(record, image)) {
      staleRecords++;
      continue;
    }
    cells.push(gradeRecord(record, image));
  }

  const models = sortVisibilityLeaderboard(
    [...new Set(cells.map((c) => c.series))].map((series) =>
      computeVisibilityMetrics(series, cells),
    ),
  );

  return {
    schemaVersion: 2,
    generatedAt: now.toISOString(),
    dataset,
    images: [...images],
    models,
    cells,
    staleRecords,
  };
}
