import { describe, it, expect } from "vitest";
import {
  VisualAIError,
  VisualAIAuthError,
  VisualAIRateLimitError,
  VisualAIProviderError,
  VisualAIImageError,
  VisualAIResponseParseError,
  VisualAIConfigError,
  VisualAIAssertionError,
  isVisualAIKnownError,
} from "../src/errors.js";

describe("VisualAIError", () => {
  it("is an instance of Error", () => {
    const err = new VisualAIError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(VisualAIError);
    expect(err.message).toBe("test");
    expect(err.name).toBe("VisualAIError");
    expect(err.code).toBe("VISUAL_AI_ERROR");
  });
});

describe("VisualAIAuthError", () => {
  it("extends VisualAIError", () => {
    const err = new VisualAIAuthError("invalid key");
    expect(err).toBeInstanceOf(VisualAIError);
    expect(err).toBeInstanceOf(VisualAIAuthError);
    expect(err.name).toBe("VisualAIAuthError");
    expect(err.code).toBe("AUTH_FAILED");
  });
});

describe("VisualAIRateLimitError", () => {
  it("extends VisualAIError with retryAfter", () => {
    const err = new VisualAIRateLimitError("rate limited", 30);
    expect(err).toBeInstanceOf(VisualAIError);
    expect(err).toBeInstanceOf(VisualAIRateLimitError);
    expect(err.retryAfter).toBe(30);
    expect(err.name).toBe("VisualAIRateLimitError");
    expect(err.code).toBe("RATE_LIMITED");
  });

  it("retryAfter is optional", () => {
    const err = new VisualAIRateLimitError("rate limited");
    expect(err.retryAfter).toBeUndefined();
  });
});

describe("VisualAIProviderError", () => {
  it("extends VisualAIError with statusCode", () => {
    const err = new VisualAIProviderError("server error", 500);
    expect(err).toBeInstanceOf(VisualAIError);
    expect(err).toBeInstanceOf(VisualAIProviderError);
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe("VisualAIProviderError");
  });

  it("statusCode is optional", () => {
    const err = new VisualAIProviderError("error");
    expect(err.statusCode).toBeUndefined();
  });

  it("uses the provider error code", () => {
    const err = new VisualAIProviderError("error");
    expect(err.code).toBe("PROVIDER_ERROR");
  });
});

describe("VisualAIImageError", () => {
  it("extends VisualAIError", () => {
    const err = new VisualAIImageError("corrupt image");
    expect(err).toBeInstanceOf(VisualAIError);
    expect(err).toBeInstanceOf(VisualAIImageError);
    expect(err.name).toBe("VisualAIImageError");
    expect(err.code).toBe("IMAGE_INVALID");
  });
});

describe("VisualAIResponseParseError", () => {
  it("extends VisualAIError with rawResponse", () => {
    const err = new VisualAIResponseParseError("parse failed", '{"bad": true}');
    expect(err).toBeInstanceOf(VisualAIError);
    expect(err).toBeInstanceOf(VisualAIResponseParseError);
    expect(err.rawResponse).toBe('{"bad": true}');
    expect(err.name).toBe("VisualAIResponseParseError");
    expect(err.code).toBe("RESPONSE_PARSE_FAILED");
  });
});

describe("VisualAIConfigError", () => {
  it("extends VisualAIError", () => {
    const err = new VisualAIConfigError("missing SDK");
    expect(err).toBeInstanceOf(VisualAIError);
    expect(err).toBeInstanceOf(VisualAIConfigError);
    expect(err.name).toBe("VisualAIConfigError");
    expect(err.code).toBe("CONFIG_INVALID");
  });
});

describe("VisualAIAssertionError", () => {
  it("extends VisualAIError with the assertion result", () => {
    const result = {
      pass: false,
      reasoning: "Button is missing",
      issues: [],
      statements: [],
    };
    const err = new VisualAIAssertionError("assertion failed", result);
    expect(err).toBeInstanceOf(VisualAIError);
    expect(err).toBeInstanceOf(VisualAIAssertionError);
    expect(err.name).toBe("VisualAIAssertionError");
    expect(err.code).toBe("ASSERTION_FAILED");
    expect(err.result).toEqual(result);
  });
});

describe("VisualAIError code handling", () => {
  it("supports switching on error.code after narrowing with isVisualAIKnownError()", () => {
    const err = new VisualAIRateLimitError("slow down", 60);

    const describeError = (value: unknown): string => {
      if (isVisualAIKnownError(value)) {
        switch (value.code) {
          case "RATE_LIMITED":
            return `retry:${value.retryAfter}`;
          case "AUTH_FAILED":
            return "auth";
          default:
            return "other";
        }
      }

      return "unknown";
    };

    expect(describeError(err)).toBe("retry:60");
  });

  it("does not treat the base VisualAIError as a known concrete error", () => {
    expect(isVisualAIKnownError(new VisualAIError("base error"))).toBe(false);
  });
});
