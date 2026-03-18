import { z } from "zod";
import type { AccessibilityCheckName, ContentCheckName, LayoutCheckName } from "./constants.js";

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
});
/** Outcome of a single statement evaluated by `check()`. */
export type StatementResult = z.infer<typeof StatementResultSchema>;

// --- Usage info ---

/** Zod schema for token and latency metadata attached to API calls. */
export const UsageInfoSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
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

/** Zod schema for results returned by `check()` and template helpers. */
export const CheckResultSchema = BaseResultSchema.extend({
  issues: z.array(IssueSchema),
  statements: z.array(StatementResultSchema),
});
/** Result returned by `check()` and the template convenience methods. */
export type CheckResult = z.infer<typeof CheckResultSchema>;

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

/** Zod schema for results returned by `ask()`. */
export const AskResultSchema = z.object({
  summary: z.string(),
  issues: z.array(IssueSchema),
  usage: UsageInfoSchema.optional(),
});
/** Result returned by `ask()`. */
export type AskResult = z.infer<typeof AskResultSchema>;

// --- Image input ---

/** Supported input shapes for image arguments accepted by the client. */
export type ImageInput = Buffer | Uint8Array | string;

/** Supported image MIME types accepted by all providers. */
export type SupportedMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

// --- Provider names ---

/** Supported provider identifiers. */
export type ProviderName = "anthropic" | "openai" | "google";

// --- Reasoning effort ---

/** Optional reasoning depth requested from providers that support it. */
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

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
  debug?: boolean;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  trackUsage?: boolean;
}

// --- Template option types ---

/** Optional instructions for `check()`. */
export interface CheckOptions {
  instructions?: readonly string[];
}

/** Optional instructions for `ask()`. */
export interface AskOptions {
  instructions?: readonly string[];
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
