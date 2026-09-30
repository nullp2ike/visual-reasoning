import type { Scores } from "./types.js";

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
  /** "extra" when the judge picked none, else the expected defect it matched ("E0"). */
  label: string;
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
export function summarizeConfidence(scores: Scores, limit = 25): ConfidenceSummary | undefined {
  const cells = scores.cells.filter((c) => c.decisions && c.decisions.length > 0);
  if (cells.length === 0) return undefined;

  const all: LowConfidenceDecision[] = cells.flatMap((cell) =>
    (cell.decisions ?? []).map((d) => ({
      series: cell.series,
      imageId: cell.imageId,
      rep: cell.rep,
      reportedIndex: d.reportedIndex,
      label: d.expectedIndex === null ? "extra" : `E${d.expectedIndex}`,
      probability: d.probability,
      confidence: d.confidence,
      description: cell.reportedIssues[d.reportedIndex]?.description ?? "",
    })),
  );

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
