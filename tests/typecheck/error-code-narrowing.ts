import {
  isVisualAIKnownError,
  VisualAIAssertionError,
  VisualAIAuthError,
  VisualAIConfigError,
  VisualAIImageError,
  VisualAIKnownError,
  VisualAIProviderError,
  VisualAIRateLimitError,
  VisualAIResponseParseError,
} from "../../src/index.js";

export function describeKnownError(error: VisualAIKnownError): string {
  switch (error.code) {
    case "AUTH_FAILED":
      return error.message;
    case "RATE_LIMITED":
      return String(error.retryAfter ?? "none");
    case "PROVIDER_ERROR":
      return String(error.statusCode ?? "none");
    case "IMAGE_INVALID":
      return error.message;
    case "RESPONSE_PARSE_FAILED":
      return error.rawResponse;
    case "CONFIG_INVALID":
      return error.message;
    case "ASSERTION_FAILED":
      return error.result.reasoning;
  }
}

export function describeUnknownError(error: unknown): string {
  if (!isVisualAIKnownError(error)) {
    return "unknown";
  }

  switch (error.code) {
    case "AUTH_FAILED":
      return error.message;
    case "RATE_LIMITED":
      return String(error.retryAfter ?? "none");
    case "PROVIDER_ERROR":
      return String(error.statusCode ?? "none");
    case "IMAGE_INVALID":
      return error.message;
    case "RESPONSE_PARSE_FAILED":
      return error.rawResponse;
    case "CONFIG_INVALID":
      return error.message;
    case "ASSERTION_FAILED":
      return error.result.reasoning;
  }
}

export const knownErrors: VisualAIKnownError[] = [
  new VisualAIAuthError("auth"),
  new VisualAIRateLimitError("rate", 10),
  new VisualAIProviderError("provider", 500),
  new VisualAIImageError("image"),
  new VisualAIResponseParseError("parse", "{}"),
  new VisualAIConfigError("config"),
  new VisualAIAssertionError("assertion", {
    pass: false,
    reasoning: "failed",
    issues: [],
    statements: [],
  }),
];
