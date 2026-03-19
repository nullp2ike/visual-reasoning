import { afterEach, describe, expect, it, vi } from "vitest";
import { formatError, usageLog } from "../../src/core/debug.js";
import {
  VisualAIImageError,
  VisualAIProviderError,
  VisualAIResponseParseError,
} from "../../src/errors.js";
import type { ResolvedConfig } from "../../src/core/config.js";

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

describe("usageLog", () => {
  const baseConfig: ResolvedConfig = {
    provider: "openai",
    apiKey: "k",
    model: "gpt-5-mini",
    maxTokens: 4096,
    reasoningEffort: undefined,
    debug: false,
    debugPrompt: false,
    debugResponse: false,
    trackUsage: true,
  };

  const baseUsage = {
    inputTokens: 100,
    outputTokens: 50,
    estimatedCost: 0.001234,
    durationSeconds: 1.234,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows explicit reasoning effort without suffix", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    usageLog({ ...baseConfig, reasoningEffort: "high" }, "check", baseUsage);
    const output = String(stderrSpy.mock.calls[0]?.[0]);
    expect(output).toContain("[gpt-5-mini, reasoning: high]");
    expect(output).not.toContain("(provider default)");
  });

  it("shows provider default with '(provider default)' suffix when unset", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    usageLog(baseConfig, "check", baseUsage);
    const output = String(stderrSpy.mock.calls[0]?.[0]);
    expect(output).toContain("[gpt-5-mini, reasoning: medium (provider default)]");
  });

  it("shows 'off (provider default)' for anthropic when unset", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    usageLog(
      { ...baseConfig, provider: "anthropic", model: "claude-sonnet-4-6" },
      "check",
      baseUsage,
    );
    const output = String(stderrSpy.mock.calls[0]?.[0]);
    expect(output).toContain("[claude-sonnet-4-6, reasoning: off (provider default)]");
  });

  it("does not log when trackUsage is false", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    usageLog({ ...baseConfig, trackUsage: false }, "check", baseUsage);
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
