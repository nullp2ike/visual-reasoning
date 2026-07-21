import { z } from "zod";
import type {
  AccessibilityCheckName,
  ContentCheckName,
  LayoutCheckName,
  ReasoningEffortLevel,
} from "./constants.js";

// --- Issue types ---

/** Zod schema for issue severity levels returned by checks and questions. */
export const IssuePrioritySchema = z.enum(["critical", "major", "minor"]);
/** Severity level for a detected visual issue. */
export type IssuePriority = z.infer<typeof IssuePrioritySchema>;

/** Zod schema for the categories assigned to detected visual issues. */
export const IssueCategorySchema = z.enum([
  "accessibility",
  "missing-element",
  "layout",
  "content",
  "styling",
  "functionality",
  "performance",
  "other",
]);
/** Category assigned to a detected visual issue. */
export type IssueCategory = z.infer<typeof IssueCategorySchema>;

/** Zod schema for a structured issue reported by the model. */
export const IssueSchema = z.object({
  priority: IssuePrioritySchema,
  category: IssueCategorySchema,
  description: z.string(),
  suggestion: z.string(),
});
/** Structured issue reported by a visual check or question. */
export type Issue = z.infer<typeof IssueSchema>;

// --- Per-statement result (for check) ---

/** Zod schema for model confidence labels on statement-level results. */
export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
/** Confidence level attached to a statement result. */
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** Zod schema for an individual statement evaluation within `check()`. */
export const StatementResultSchema = z.object({
  statement: z.string(),
  pass: z.boolean(),
  reasoning: z.string(),
  confidence: ConfidenceSchema.optional(),
  /**
   * For video inputs, the approximate timestamp (in seconds, from the start of the clip)
   * of the frame that most clearly demonstrates the statement. `null` when the statement
   * fails or applies across the whole clip. Always omitted for image inputs.
   */
  timestampSeconds: z.number().nonnegative().nullable().optional(),
});
/** Outcome of a single statement evaluated by `check()`. */
export type StatementResult = z.infer<typeof StatementResultSchema>;

// --- Usage info ---

/** Zod schema for token and latency metadata attached to API calls. */
export const UsageInfoSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  /** Reasoning/thinking tokens consumed by the model (informational, typically included within outputTokens). */
  reasoningTokens: z.number().optional(),
  estimatedCost: z.number().optional(),
  durationSeconds: z.number().nonnegative().optional(),
});
/** Token usage and optional cost/latency metadata for a provider call. */
export type UsageInfo = z.infer<typeof UsageInfoSchema>;

// --- Base result (shared fields) ---

const BaseResultSchema = z.object({
  pass: z.boolean(),
  reasoning: z.string(),
  usage: UsageInfoSchema.optional(),
});

// --- check() / template result ---

/**
 * Zod schema for results returned by `check()` and template helpers.
 *
 * Note: the runtime `CheckResult` TypeScript type extends this schema with
 * an optional `frames` field that is populated client-side for video inputs.
 * Parsing a stored `CheckResult` through this schema will silently drop
 * `frames` because the schema only describes what the model returns.
 */
export const CheckResultSchema = BaseResultSchema.extend({
  issues: z.array(IssueSchema),
  statements: z.array(StatementResultSchema),
});
/**
 * Metadata describing the sampled-frame timeline used when the input was a video.
 * Populated client-side; not part of the model's response.
 */
export interface VideoFramesMetadata {
  /** Total number of frames sampled from the video. */
  count: number;
  /** Timestamp (seconds, from the start of the clip) of each sampled frame, in order. */
  timestampsSeconds: number[];
  /** Total duration of the source video in seconds. */
  durationSeconds: number;
}
/** Result returned by `check()` and the template convenience methods. */
export type CheckResult = z.infer<typeof CheckResultSchema> & {
  /** Present only when the input was a video. Describes which frames the model saw. */
  frames?: VideoFramesMetadata;
};

// --- compare() result ---

/** Zod schema for an individual visual change reported by `compare()`. */
export const ChangeEntrySchema = z.object({
  description: z.string(),
  severity: IssuePrioritySchema,
});
/** Single visual change reported by `compare()`. */
export type ChangeEntry = z.infer<typeof ChangeEntrySchema>;

/** Zod schema for the parsed model response returned by `compare()`. */
export const CompareResultSchema = BaseResultSchema.extend({
  changes: z.array(ChangeEntrySchema).max(50),
});
// diffImage is appended client-side after the AI response is parsed,
// so it intentionally does not appear in CompareResultSchema.
/** Result returned by `compare()`, optionally including an AI-generated diff image. */
export type CompareResult = z.infer<typeof CompareResultSchema> & {
  diffImage?: DiffImageResult;
};

// --- ask() result ---

/**
 * Zod schema for results returned by `ask()`.
 *
 * Note: the runtime `AskResult` TypeScript type extends this schema with an
 * optional `frames` field that is populated client-side for video inputs.
 * Parsing a stored `AskResult` through this schema will silently drop
 * `frames` because the schema only describes what the model returns.
 */
export const AskResultSchema = z.object({
  summary: z.string(),
  issues: z.array(IssueSchema),
  /**
   * For video inputs, the indices of frames the model relied on to answer.
   * Indices are 0-based and refer to entries in `frames.timestampsSeconds`.
   *
   * Nullable because providers with strict structured-output schemas (e.g. OpenAI)
   * must mark every field required and represent "no value" as `null` rather than
   * omitting the key, even for image inputs that were never asked to populate it.
   */
  frameReferences: z.array(z.number().int().nonnegative()).nullable().optional(),
  usage: UsageInfoSchema.optional(),
});
/** Result returned by `ask()`. */
export type AskResult = Omit<z.infer<typeof AskResultSchema>, "frameReferences"> & {
  /** Present only when the input was a video. Describes which frames the model saw. */
  frameReferences?: number[];
  frames?: VideoFramesMetadata;
};

// --- Image / media input ---

/** Supported input shapes for image arguments accepted by the client. */
export type ImageInput = Buffer | Uint8Array | string;

/**
 * Supported input shapes for media arguments accepted by the client.
 * Identical to `ImageInput` today — the client auto-detects whether the bytes are
 * an image or a video.
 */
export type MediaInput = ImageInput;

/**
 * A single pre-sampled frame with an explicit timestamp. Use this shape when
 * you want to control the timestamp the model sees; otherwise pass a bare
 * `ImageInput` and the timestamp is derived from `fps` and the frame's position.
 */
export interface TimestampedFrameInput {
  /** Image source for the frame (buffer, data URL, base64, file path, or URL). */
  image: ImageInput;
  /** Timestamp in seconds, from the start of the sequence. Derived from `fps` when omitted. */
  timestampSeconds?: number;
}

/**
 * Pre-sampled frames supplied directly instead of a video file. Useful when you
 * already have an array of screenshots and cannot (or would rather not) pass a
 * video — this path never loads ffmpeg. Passed to `check()` / `ask()` in place
 * of a `MediaInput`; downstream handling is identical to a sampled video.
 */
export interface FramesInput {
  /**
   * Ordered frames, earliest first. Each entry is an image source or a
   * `{ image, timestampSeconds }` pair. Must be non-empty and is capped at the
   * same per-request frame limit as video sampling (60).
   */
  frames: ReadonlyArray<ImageInput | TimestampedFrameInput>;
  /**
   * Frame rate used to derive timestamps for frames that don't carry their own
   * `timestampSeconds` (frame `i` maps to `i / fps` seconds). Default `1`.
   */
  fps?: number;
}

/** Supported image MIME types accepted by all providers. */
export type SupportedMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/** Supported video MIME types the client can accept and sample frames from. */
export type SupportedVideoMimeType =
  | "video/mp4"
  | "video/webm"
  | "video/quicktime"
  | "video/x-matroska";

// --- Provider names ---

/** Supported provider identifiers. */
export type ProviderName = "anthropic" | "openai" | "google";

// --- VisualAI config ---

/**
 * Configuration for creating a visual AI client.
 *
 * @example
 * ```ts
 * const client = visualAI({
 *   model: "gpt-5-mini",
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 * ```
 */
export interface VisualAIConfig {
  apiKey?: string;
  model?: string;
  /** Enable error diagnostic logging to stderr. Does not enable prompt/response logging — use `debugPrompt` and `debugResponse` for that. */
  debug?: boolean;
  /** Log prompts to stderr. */
  debugPrompt?: boolean;
  /** Log responses to stderr. */
  debugResponse?: boolean;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffortLevel;
  trackUsage?: boolean;
}

// --- Template option types ---

/** Optional instructions for `check()`. */
export interface CheckOptions {
  instructions?: readonly string[];
  /**
   * Frame-sampling configuration applied when the input is a video.
   * Ignored for image inputs. See `VideoSamplingOptions` for defaults.
   */
  video?: VideoSamplingOptions;
}

/** Optional instructions for `ask()`. */
export interface AskOptions {
  instructions?: readonly string[];
  /**
   * Frame-sampling configuration applied when the input is a video.
   * Ignored for image inputs. See `VideoSamplingOptions` for defaults.
   */
  video?: VideoSamplingOptions;
}

// --- Diff image types ---

/** Metadata and binary content for an AI-generated diff image. */
export interface DiffImageResult {
  data: Buffer;
  width: number;
  height: number;
  mimeType: "image/png";
}

/** Optional prompt, instructions, and diff configuration for `compare()`. */
export interface CompareOptions {
  prompt?: string;
  instructions?: readonly string[];
  diffImage?: boolean;
}

/** Optional instructions for `elementsVisible()` and `elementsHidden()`. */
export interface ElementsVisibilityOptions {
  instructions?: readonly string[];
}

/** Options for the built-in accessibility template. */
export interface AccessibilityOptions {
  checks?: AccessibilityCheckName[];
  instructions?: readonly string[];
}

/** Options for the built-in layout template. */
export interface LayoutOptions {
  checks?: LayoutCheckName[];
  instructions?: readonly string[];
}

/** Options for the built-in page-load template. */
export interface PageLoadOptions {
  expectLoaded?: boolean;
  instructions?: readonly string[];
}

/** Options for the built-in content template. */
export interface ContentOptions {
  checks?: ContentCheckName[];
  instructions?: readonly string[];
}

// --- Normalized image (internal) ---

/** Internal normalized image representation passed to provider drivers. */
export interface NormalizedImage {
  readonly data: Buffer;
  readonly mimeType: SupportedMimeType;
  readonly base64: string;
}

// --- Video sampling ---

/**
 * Options for sampling frames from a video input. Defaults match the v1
 * sampling strategy: 1 fps, capped at 10 frames, max duration 10 s.
 */
export interface VideoSamplingOptions {
  /** Sampling rate in frames per second. Default `1`. */
  fps?: number;
  /**
   * Maximum number of frames extracted regardless of duration. Default `10`.
   * Hard-capped at `60` to keep memory bounded; values above the cap throw
   * `VisualAIVideoError`.
   */
  maxFrames?: number;
  /**
   * Maximum video duration accepted, in seconds. Videos longer than this
   * cause `VisualAIVideoError` to be thrown before any provider call.
   * Default `10`.
   */
  maxDurationSeconds?: number;
}

/**
 * A single frame extracted from a video input. Identical in shape to
 * `NormalizedImage` so it can be passed transparently to provider drivers.
 */
export interface Frame extends NormalizedImage {
  /** 0-based timestamp (seconds, from the start of the clip) of this frame. */
  readonly timestampSeconds: number;
  /** 0-based index of this frame within the sampled sequence. */
  readonly index: number;
}
