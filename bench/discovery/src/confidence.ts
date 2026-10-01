import type { Manifest, Scores } from "./types.js";

/**
 * A decision below this confidence counts as uncertain. For Jev's two-option
 * questions (one expected defect plus "none") confidence 0.8 is a probability
 * of 0.9, the cut that isolated nearly all of its disagreements with the chat
 * judges on golden.
 */
export const UNCERTAIN_CONFIDENCE = 0.8;

const BUCKETS = [
  { from: 0, to: 0.5 },
  { from: 0.5, to: 0.8 },
  { from: 0.8, to: 0.9 },
  { from: 0.9, to: 0.95 },
  { from: 0.95, to: 1 },
];

export interface ConfidenceBucket {
  label: string;
  count: number;
}

export interface LowConfidenceDecision {
  series: string;
  imageId: string;
  rep: number;
  reportedIndex: number;
  /**
   * "extra" when the judge picked none, else "matches expected defect" (numbered
   * when the screenshot has several).
   */
  label: string;
  /** The matched expected defect's text, for a tooltip; absent for extras. */
  expectedText?: string;
  probability: number;
  confidence: number;
  description: string;
}

export interface ConfidenceSummary {
  decisions: number;
  buckets: ConfidenceBucket[];
  judgedRuns: number;
  uncertainRuns: number;
  leastConfident: LowConfidenceDecision[];
}

/**
 * Summarise a decision judge's confidence across every scored cell, or return
 * undefined for a chat-model judge, whose cells carry no decisions.
 */
/** How a decision reads on the page: the matched defect in words, or "extra". */
export function decisionLabel(expectedIndex: number | null, expectedCount: number): string {
  if (expectedIndex === null) return "extra";
  return expectedCount > 1
    ? `matches expected defect ${expectedIndex + 1}`
    : "matches expected defect";
}

export function summarizeConfidence(
  scores: Scores,
  manifest: Manifest,
  limit = 25,
): ConfidenceSummary | undefined {
  const expectedByImage = new Map(manifest.entries.map((e) => [e.imageId, e.expectedIssues]));
  const cells = scores.cells.filter((c) => c.decisions && c.decisions.length > 0);
  if (cells.length === 0) return undefined;

  const all: LowConfidenceDecision[] = cells.flatMap((cell) => {
    const expected = expectedByImage.get(cell.imageId) ?? [];
    return (cell.decisions ?? []).map((d) => ({
      series: cell.series,
      imageId: cell.imageId,
      rep: cell.rep,
      reportedIndex: d.reportedIndex,
      label: decisionLabel(d.expectedIndex, expected.length),
      expectedText: d.expectedIndex === null ? undefined : expected[d.expectedIndex],
      probability: d.probability,
      confidence: d.confidence,
      description: cell.reportedIssues[d.reportedIndex]?.description ?? "",
    }));
  });

  const buckets = BUCKETS.map(({ from, to }, i) => ({
    label: `${from.toFixed(2)}–${to.toFixed(2)}`,
    count: all.filter(
      (d) =>
        d.confidence >= from && (i === BUCKETS.length - 1 ? d.confidence <= to : d.confidence < to),
    ).length,
  }));

  const uncertainRuns = cells.filter((c) =>
    (c.decisions ?? []).some((d) => d.confidence < UNCERTAIN_CONFIDENCE),
  ).length;

  const leastConfident = [...all]
    .sort((a, b) => a.confidence - b.confidence || a.series.localeCompare(b.series))
    .slice(0, limit);

  return {
    decisions: all.length,
    buckets,
    judgedRuns: cells.length,
    uncertainRuns,
    leastConfident,
  };
}
