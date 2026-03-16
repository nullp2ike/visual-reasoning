import type { CheckResult, CompareResult } from "./types.js";

/**
 * Discrete error codes exposed by visual-ai-assertions for programmatic handling.
 */
export type VisualAIErrorCode =
  | "VISUAL_AI_ERROR"
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "IMAGE_INVALID"
  | "RESPONSE_PARSE_FAILED"
  | "CONFIG_INVALID"
  | "ASSERTION_FAILED";

/**
 * Base class for all library errors.
 *
 * @example
 * ```ts
 * try {
 *   // ...
 * } catch (error) {
 *   if (error instanceof VisualAIError) {
 *     console.error(error.code, error.message);
 *   }
 * }
 * ```
 */
export class VisualAIError<TCode extends VisualAIErrorCode = VisualAIErrorCode> extends Error {
  readonly code: TCode;

  constructor(message: string, code: TCode = "VISUAL_AI_ERROR" as TCode) {
    super(message);
    this.code = code;
    this.name = "VisualAIError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a provider rejects the configured API credentials.
 *
 * @example
 * ```ts
 * throw new VisualAIAuthError("Anthropic API key not found");
 * ```
 */
export class VisualAIAuthError extends VisualAIError<"AUTH_FAILED"> {
  declare readonly code: "AUTH_FAILED";

  constructor(message: string) {
    super(message, "AUTH_FAILED");
    this.name = "VisualAIAuthError";
  }
}

/**
 * Thrown when a provider enforces a rate limit.
 *
 * Carries `retryAfter` when the provider includes retry guidance.
 *
 * @example
 * ```ts
 * throw new VisualAIRateLimitError("Rate limited", 30);
 * ```
 */
export class VisualAIRateLimitError extends VisualAIError<"RATE_LIMITED"> {
  declare readonly code: "RATE_LIMITED";
  retryAfter?: number;

  constructor(message: string, retryAfter?: number) {
    super(message, "RATE_LIMITED");
    this.name = "VisualAIRateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Thrown when a provider returns an unexpected non-auth, non-rate-limit failure.
 *
 * Carries `statusCode` when the provider exposes an HTTP status.
 *
 * @example
 * ```ts
 * throw new VisualAIProviderError("Provider returned 500", 500);
 * ```
 */
export class VisualAIProviderError extends VisualAIError<"PROVIDER_ERROR"> {
  declare readonly code: "PROVIDER_ERROR";
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message, "PROVIDER_ERROR");
    this.name = "VisualAIProviderError";
    this.statusCode = statusCode;
  }
}

/**
 * Thrown when an image input cannot be loaded, decoded, or validated.
 *
 * @example
 * ```ts
 * throw new VisualAIImageError("Unsupported image format: image/bmp");
 * ```
 */
export class VisualAIImageError extends VisualAIError<"IMAGE_INVALID"> {
  declare readonly code: "IMAGE_INVALID";

  constructor(message: string) {
    super(message, "IMAGE_INVALID");
    this.name = "VisualAIImageError";
  }
}

/**
 * Thrown when a provider response cannot be parsed into the library result schema.
 *
 * Carries `rawResponse` so callers can inspect the original model output.
 *
 * @example
 * ```ts
 * throw new VisualAIResponseParseError("Invalid JSON", rawText);
 * ```
 */
export class VisualAIResponseParseError extends VisualAIError<"RESPONSE_PARSE_FAILED"> {
  declare readonly code: "RESPONSE_PARSE_FAILED";
  rawResponse: string;

  constructor(message: string, rawResponse: string) {
    super(message, "RESPONSE_PARSE_FAILED");
    this.name = "VisualAIResponseParseError";
    this.rawResponse = rawResponse;
  }
}

/**
 * Thrown when library configuration is missing or invalid.
 *
 * @example
 * ```ts
 * throw new VisualAIConfigError("At least one statement is required for check()");
 * ```
 */
export class VisualAIConfigError extends VisualAIError<"CONFIG_INVALID"> {
  declare readonly code: "CONFIG_INVALID";

  constructor(message: string) {
    super(message, "CONFIG_INVALID");
    this.name = "VisualAIConfigError";
  }
}

/**
 * Thrown by assertion helpers when a visual check or comparison fails.
 *
 * Carries the failed `result` for further inspection.
 *
 * @example
 * ```ts
 * throw new VisualAIAssertionError("Visual assertion failed", result);
 * ```
 */
export class VisualAIAssertionError extends VisualAIError<"ASSERTION_FAILED"> {
  declare readonly code: "ASSERTION_FAILED";
  result: CheckResult | CompareResult;

  constructor(message: string, result: CheckResult | CompareResult) {
    super(message, "ASSERTION_FAILED");
    this.name = "VisualAIAssertionError";
    this.result = result;
  }
}

/**
 * Union of all concrete error subclasses exposed by the library.
 */
export type VisualAIKnownError =
  | VisualAIAuthError
  | VisualAIRateLimitError
  | VisualAIProviderError
  | VisualAIImageError
  | VisualAIResponseParseError
  | VisualAIConfigError
  | VisualAIAssertionError;

/**
 * Narrows an unknown thrown value to the concrete visual-ai-assertions error union.
 *
 * Use this helper when you want `switch (error.code)` to narrow to subclass-specific fields.
 *
 * @param error Unknown thrown value.
 * @returns `true` when the value is one of the concrete library error subclasses.
 * @example
 * ```ts
 * try {
 *   // ...
 * } catch (error) {
 *   if (isVisualAIKnownError(error)) {
 *     switch (error.code) {
 *       case "RATE_LIMITED":
 *         console.error(error.retryAfter);
 *         break;
 *       case "PROVIDER_ERROR":
 *         console.error(error.statusCode);
 *         break;
 *     }
 *   }
 * }
 * ```
 */
export function isVisualAIKnownError(error: unknown): error is VisualAIKnownError {
  return (
    error instanceof VisualAIAuthError ||
    error instanceof VisualAIRateLimitError ||
    error instanceof VisualAIProviderError ||
    error instanceof VisualAIImageError ||
    error instanceof VisualAIResponseParseError ||
    error instanceof VisualAIConfigError ||
    error instanceof VisualAIAssertionError
  );
}
