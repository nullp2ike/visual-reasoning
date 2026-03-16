// Client
export { visualAI } from "./core/client.js";

// Constants
export {
  Provider,
  Model,
  Content,
  Layout,
  Accessibility,
  DEFAULT_MODELS,
  VALID_PROVIDERS,
} from "./constants.js";
export type {
  KnownModelName,
  ContentCheckName,
  LayoutCheckName,
  AccessibilityCheckName,
} from "./constants.js";
export type { VisualAIClient } from "./core/client.js";

// Types
export type {
  CheckResult,
  CheckOptions,
  CompareResult,
  CompareOptions,
  ChangeEntry,
  Confidence,
  AskResult,
  AskOptions,
  Issue,
  IssuePriority,
  IssueCategory,
  StatementResult,
  UsageInfo,
  VisualAIConfig,
  ImageInput,
  ProviderName,
  ReasoningEffort,
  ElementsVisibilityOptions,
  AccessibilityOptions,
  LayoutOptions,
  PageLoadOptions,
  ContentOptions,
  DiffImageResult,
  SupportedMimeType,
} from "./types.js";
export type { VisualAIErrorCode, VisualAIKnownError } from "./errors.js";

// Zod schemas (for advanced users)
export {
  CheckResultSchema,
  CompareResultSchema,
  ChangeEntrySchema,
  ConfidenceSchema,
  AskResultSchema,
  IssueSchema,
  IssuePrioritySchema,
  IssueCategorySchema,
  StatementResultSchema,
  UsageInfoSchema,
} from "./types.js";

// Errors
export {
  VisualAIError,
  VisualAIAuthError,
  VisualAIRateLimitError,
  VisualAIProviderError,
  VisualAIImageError,
  VisualAIResponseParseError,
  VisualAIConfigError,
  VisualAIAssertionError,
  isVisualAIKnownError,
} from "./errors.js";

// Formatting & assertions
export {
  formatCheckResult,
  formatCompareResult,
  assertVisualResult,
  assertVisualCompareResult,
} from "./format.js";
