import { z } from "zod";
import { IssueSchema, UsageInfoSchema } from "../../src/types.js";

// --- Dataset manifest ---

export const ManifestEntrySchema = z.object({
  /** Anonymous stable ID (img_01…). The only identifier the run pipeline uses. */
  imageId: z.string().regex(/^img_\d{2,}$/),
  /** Real filename in golden_data_set/. Never sent to a model. */
  filename: z.string(),
  sha256: z.string(),
  expectedIssues: z.array(z.string()),
});
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;

/** An image removed from the dataset. Its ID is never reassigned to another file. */
export const RetiredEntrySchema = z.object({
  imageId: z.string().regex(/^img_\d{2,}$/),
  filename: z.string(),
  sha256: z.string(),
});
export type RetiredEntry = z.infer<typeof RetiredEntrySchema>;

export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  promptHash: z.string(),
  generatedAt: z.string(),
  entries: z.array(ManifestEntrySchema),
  /** Ledger of removed images so their IDs stay retired (default for pre-ledger manifests). */
  retired: z.array(RetiredEntrySchema).default([]),
});
export type Manifest = z.infer<typeof ManifestSchema>;

// --- Per-run record (one JSON file per model x image x rep) ---

export const RunRecordSchema = z.object({
  schemaVersion: z.literal(1),
  model: z.string(),
  provider: z.string(),
  imageId: z.string(),
  rep: z.number().int().positive(),
  promptHash: z.string(),
  /** Prompt variant this run used. Optional for records written before variants existed. */
  promptVariant: z.string().optional(),
  reasoningEffort: z.string(),
  /** Image-fidelity hint used for this run (optional; absent → "auto" on pre-fidelity records). */
  imageFidelity: z.string().optional(),
  /** Output token budget used for this run (optional; absent on pre-budget records). */
  maxTokens: z.number().int().positive().optional(),
  timestamp: z.string(),
  status: z.enum(["ok", "error"]),
  result: z
    .object({
      summary: z.string(),
      issues: z.array(IssueSchema),
    })
    .optional(),
  usage: UsageInfoSchema.optional(),
  error: z
    .object({
      name: z.string(),
      message: z.string(),
      attempts: z.number().int(),
    })
    .optional(),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

// --- Judge verdict ---

export const JudgeVerdictSchema = z.object({
  expected: z.array(
    z.object({
      expectedIndex: z.number().int().nonnegative(),
      found: z.boolean(),
      matchedReportedIndexes: z.array(z.number().int().nonnegative()),
      reasoning: z.string(),
    }),
  ),
  /** Reported issue indexes that match none of the expected issues. */
  extraReportedIndexes: z.array(z.number().int().nonnegative()),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

export const JudgeCacheEntrySchema = z.object({
  judgeModel: z.string(),
  judgePromptVersion: z.string(),
  expectedIssues: z.array(z.string()),
  reportedIssues: z.array(z.string()),
  verdict: JudgeVerdictSchema,
});
export type JudgeCacheEntry = z.infer<typeof JudgeCacheEntrySchema>;

// --- Manual overrides ---

/** Keyed by `${model}/${imageId}/rep_${n}`. */
export const OverridesSchema = z.record(
  z.object({
    /** Keyed by expectedIndex (as string). */
    expected: z.record(z.enum(["found", "missed"])).optional(),
    /** Keyed by reportedIndex (as string). */
    extras: z.record(z.enum(["extra", "not-extra"])).optional(),
    note: z.string().optional(),
  }),
);
export type Overrides = z.infer<typeof OverridesSchema>;

// --- Resolved (scored) cell ---

export const ResolvedExpectedSchema = z.object({
  expectedIndex: z.number().int().nonnegative(),
  found: z.boolean(),
  matchedReportedIndexes: z.array(z.number().int().nonnegative()),
  reasoning: z.string(),
  overridden: z.boolean(),
});

export const ResolvedCellSchema = z.object({
  model: z.string(),
  /** (model, reasoningEffort) identity — see seriesId(). Cells with the same model but different effort stay distinct. */
  series: z.string(),
  imageId: z.string(),
  rep: z.number().int().positive(),
  status: z.enum(["ok", "error"]),
  /** Model-reported issues, verbatim, for display and override targeting. */
  reportedIssues: z.array(IssueSchema),
  summary: z.string().optional(),
  expected: z.array(ResolvedExpectedSchema),
  /** Reported indexes judged as not matching any expected issue (after overrides). */
  extraReportedIndexes: z.array(z.number().int().nonnegative()),
  overridden: z.boolean(),
  usage: UsageInfoSchema.optional(),
  error: z.object({ name: z.string(), message: z.string() }).optional(),
});
export type ResolvedCell = z.infer<typeof ResolvedCellSchema>;

// --- Per-model metrics ---

export const ModelMetricsSchema = z.object({
  /** (model, reasoningEffort) identity — the leaderboard/matrix row key. See seriesId(). */
  series: z.string(),
  model: z.string(),
  provider: z.string(),
  /**
   * Reasoning/thinking effort these runs used (from the run records). Each series
   * pins exactly one effort — the (model, effort) pair is the row identity, so a
   * model benchmarked at several efforts appears as several rows.
   */
  reasoningEffort: z.string(),
  okRuns: z.number().int(),
  failedRuns: z.number().int(),
  /** Mean per-expected-issue detection rate across reps (primary ranking column). */
  meanRecall: z.number().nullable(),
  /** Share of expected issues found in at least one rep. */
  anyRecall: z.number().nullable(),
  /** Share of expected issues with detection rate strictly between 0 and 1. */
  flakiness: z.number().nullable(),
  /** Mean count of extra (unmatched) reported issues per ok run, all images. */
  extrasPerRun: z.number().nullable(),
  /** Share of negative-control reps with zero reported issues. */
  noBugsCleanRate: z.number().nullable(),
  latencyMedianSeconds: z.number().nullable(),
  latencyP95Seconds: z.number().nullable(),
  meanCostPerRun: z.number().nullable(),
  totalCost: z.number().nullable(),
  meanInputTokens: z.number().nullable(),
  meanOutputTokens: z.number().nullable(),
  meanReasoningTokens: z.number().nullable(),
});
export type ModelMetrics = z.infer<typeof ModelMetricsSchema>;

// --- scores.json ---

export const ScoresSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  /** Prompt variant these scores were computed for (e.g. "baseline", "excluded"). */
  promptVariant: z.string(),
  prompt: z.string(),
  promptHash: z.string(),
  reasoningEffort: z.string(),
  repeats: z.number().int(),
  judgeModel: z.string(),
  judgePromptVersion: z.string(),
  overrideCount: z.number().int(),
  models: z.array(ModelMetricsSchema),
  cells: z.array(ResolvedCellSchema),
});
export type Scores = z.infer<typeof ScoresSchema>;
