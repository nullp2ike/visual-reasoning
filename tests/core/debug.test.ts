import { describe, expect, it } from "vitest";
import { formatError } from "../../src/core/debug.js";
import {
  VisualAIImageError,
  VisualAIProviderError,
  VisualAIResponseParseError,
} from "../../src/errors.js";

describe("formatError", () => {
  it("formats VisualAIResponseParseError with truncated raw response", () => {
    const longResponse = "x".repeat(600);
    const error = new VisualAIResponseParseError("Invalid JSON", longResponse);
    const result = formatError(error);

    expect(result).toContain("VisualAIResponseParseError");
    expect(result).toContain("RESPONSE_PARSE_FAILED");
    expect(result).toContain("Invalid JSON");
    expect(result).toContain("...");
    expect(result.length).toBeLessThan(700);
  });

  it("formats VisualAIResponseParseError with short raw response without truncation", () => {
    const error = new VisualAIResponseParseError("Invalid JSON", "short");
    const result = formatError(error);

    expect(result).toContain("short");
    expect(result).not.toContain("...");
  });

  it("formats VisualAIError subclasses with code", () => {
    const error = new VisualAIProviderError("Service unavailable", 503);
    const result = formatError(error);

    expect(result).toBe("VisualAIProviderError (PROVIDER_ERROR): Service unavailable");
  });

  it("formats base VisualAIError with code", () => {
    const error = new VisualAIImageError("Unsupported format");
    const result = formatError(error);

    expect(result).toBe("VisualAIImageError (IMAGE_INVALID): Unsupported format");
  });

  it("formats generic Error with name and message", () => {
    const error = new TypeError("Cannot read property 'x'");
    const result = formatError(error);

    expect(result).toBe("TypeError: Cannot read property 'x'");
  });

  it("formats non-Error values with String()", () => {
    expect(formatError("string error")).toBe("string error");
    expect(formatError(42)).toBe("42");
    expect(formatError(null)).toBe("null");
    expect(formatError(undefined)).toBe("undefined");
  });
});
