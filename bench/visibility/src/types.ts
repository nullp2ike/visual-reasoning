import { z } from "zod";
import { ConfidenceSchema, StatementResultSchema, UsageInfoSchema } from "../../../src/types.js";

/**
 * Which library template asks about an element. `visible` is
 * `elementsVisible()` ("the element X is fully visible on the page");
 * `hidden` is `elementsHidden()` ("the element X is NOT visible on the page").
 *
 * The section a bullet sits under in the ground truth picks the mode; its
 * `| TRUE` / `| FALSE` flag picks the expected answer. The two are independent,
 * which is what makes a `### absent` bullet a genuinely different question
 * rather than a relabelled one.
 */
export const CallModeSchema = z.enum(["visible", "hidden"]);
export type CallMode = z.infer<typeof CallModeSchema>;

// --- Ground truth ---

/** One image under test: what is asked, how it is asked, and the true answers. */
export const VisibilityImageSchema = z.object({
  filename: z.string(),
  sha256: z.string(),
  /** Elements asked with the `elementsVisible()` prompt, sorted. */
  visibleCall: z.array(z.string()),
  /** Elements asked with the `elementsHidden()` prompt, sorted. */
  hiddenCall: z.array(z.string()),
  /**
   * Every element under test, sorted. Used for display and counting; the two
   * call lists are what actually reach a model.
   */
  elements: z.array(z.string()).min(1),
  /**
   * Elements the model should report as on screen, whichever prompt asked.
   * Everything else in `elements` should be reported as not on screen.
   */
  expectedVisible: z.array(z.string()),
  /** sha256 over both built prompts. Detects rewording and library prompt edits. */
  promptHash: z.string(),
});
export type VisibilityImage = z.infer<typeof VisibilityImageSchema>;

// --- Per-run record (one JSON file per model x image x rep) ---

/** One model call within a rep. A rep makes one call per non-empty section. */
export const VisibilityCallSchema = z.object({
  mode: CallModeSchema,
  /** Elements sent, in the order sent. Statements are matched to these by index. */
  elements: z.array(z.string()).min(1),
  status: z.enum(["ok", "error"]),
  result: z
    .object({
      pass: z.boolean(),
      reasoning: z.string(),
      statements: z.array(StatementResultSchema),
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
export type VisibilityCall = z.infer<typeof VisibilityCallSchema>;

export const VisibilityRunRecordSchema = z.object({
  schemaVersion: z.literal(2),
  model: z.string(),
  provider: z.string(),
  filename: z.string(),
  /** Bytes the model actually saw. With promptHash, decides whether a record is current. */
  imageSha256: z.string(),
  rep: z.number().int().positive(),
  promptHash: z.string(),
  reasoningEffort: z.string(),
  imageFidelity: z.string(),
  /**
   * Whether `elementsVisible()` judged rendering quality (`--correct-rendering`)
   * or presence only (the library default). A run axis like effort and
   * fidelity: both settings keep their own records and leaderboard rows.
   * Defaulted so records written before the axis existed read as the default.
   */
  requireCorrectRendering: z.boolean().default(false),
  maxTokens: z.number().int().positive(),
  timestamp: z.string(),
  /** `ok` only when every call in the rep succeeded — a rep is graded as a whole. */
  status: z.enum(["ok", "error"]),
  calls: z.array(VisibilityCallSchema).min(1),
  /** Usage summed across the rep's calls, so cost and latency stay per-rep. */
  usage: UsageInfoSchema.optional(),
  error: z
    .object({
      name: z.string(),
      message: z.string(),
      attempts: z.number().int(),
    })
    .optional(),
});
export type VisibilityRunRecord = z.infer<typeof VisibilityRunRecordSchema>;

// --- Graded results ---

export const GradedElementSchema = z.object({
  element: z.string(),
  /** Which prompt asked about this element. */
  askedAs: CallModeSchema,
  expectedVisible: z.boolean(),
  /**
   * The model's answer, normalised to "is it on screen?". Under the hidden
   * prompt a `pass` means "not visible", so it is inverted here — which lets
   * accuracy and the hallucination rate mean the same thing in both modes.
   */
  answeredVisible: z.boolean(),
  correct: z.boolean(),
  confidence: ConfidenceSchema.optional(),
  reasoning: z.string(),
  /**
   * The returned statement text did not contain the element description. The
   * answer is still graded by index (the library's contract), but a run full of
   * these is worth a look: the model may have reordered or merged statements.
   */
  textMismatch: z.boolean(),
});
export type GradedElement = z.infer<typeof GradedElementSchema>;

export const GradedCellSchema = z.object({
  series: z.string(),
  model: z.string(),
  provider: z.string(),
  reasoningEffort: z.string(),
  imageFidelity: z.string(),
  filename: z.string(),
  rep: z.number().int().positive(),
  /**
   * `ok` — graded. `error` — a call in the rep failed. `invalid` — every call
   * succeeded but a response could not be matched to the elements sent (wrong
   * statement count), so the rep is excluded from every rate rather than
   * silently counted as wrong.
   */
  status: z.enum(["ok", "error", "invalid"]),
  invalidReason: z.string().optional(),
  elements: z.array(GradedElementSchema),
  /** True when every element in this rep was answered correctly. Null unless ok. */
  allCorrect: z.boolean().nullable(),
  usage: UsageInfoSchema.optional(),
  error: z.object({ name: z.string(), message: z.string() }).optional(),
});
export type GradedCell = z.infer<typeof GradedCellSchema>;

// --- Per-model metrics ---

export const VisibilityModelMetricsSchema = z.object({
  /** (model, effort, fidelity) identity — the leaderboard row key. See seriesId(). */
  series: z.string(),
  model: z.string(),
  provider: z.string(),
  reasoningEffort: z.string(),
  imageFidelity: z.string(),
  okRuns: z.number().int(),
  failedRuns: z.number().int(),
  invalidRuns: z.number().int(),
  /** Correct answers / all answers over ok runs (primary ranking column). */
  accuracy: z.number().nullable(),
  /** Share of expected-visible elements answered visible. Misses are blindness. */
  presentRecall: z.number().nullable(),
  /** Share of expected-absent elements answered not visible. 1 − this is the hallucination rate. */
  absentAccuracy: z.number().nullable(),
  /** Accuracy over elements asked with the `elementsVisible()` prompt. */
  visiblePromptAccuracy: z.number().nullable(),
  /** Accuracy over elements asked with the `elementsHidden()` prompt. */
  hiddenPromptAccuracy: z.number().nullable(),
  /** Share of ok runs in which every element was correct. */
  allCorrectRate: z.number().nullable(),
  /** Share of (image, element) pairs answered inconsistently across reps. */
  flakiness: z.number().nullable(),
  /** Count of graded elements whose statement text did not echo the element. */
  textMismatches: z.number().int(),
  latencyMedianSeconds: z.number().nullable(),
  latencyP95Seconds: z.number().nullable(),
  meanCostPerRun: z.number().nullable(),
  totalCost: z.number().nullable(),
  meanInputTokens: z.number().nullable(),
  meanOutputTokens: z.number().nullable(),
  meanReasoningTokens: z.number().nullable(),
});
export type VisibilityModelMetrics = z.infer<typeof VisibilityModelMetricsSchema>;

// --- scores.json ---

export const VisibilityScoresSchema = z.object({
  schemaVersion: z.literal(2),
  generatedAt: z.string(),
  dataset: z.string(),
  images: z.array(VisibilityImageSchema),
  models: z.array(VisibilityModelMetricsSchema),
  cells: z.array(GradedCellSchema),
  /**
   * Records on disk whose prompt or image hash no longer matches the dataset.
   * They are not graded — re-run to refresh them.
   */
  staleRecords: z.number().int(),
});
export type VisibilityScores = z.infer<typeof VisibilityScoresSchema>;
