import { describe, it, expect } from "vitest";
import { calculateCost } from "../../src/core/pricing.js";

describe("calculateCost", () => {
  it("calculates cost for anthropic claude-sonnet-4-6", () => {
    const cost = calculateCost("anthropic", "claude-sonnet-4-6", 1000, 500);
    // 1000 * (3/1M) + 500 * (15/1M) = 0.003 + 0.0075 = 0.0105
    expect(cost).toBeCloseTo(0.0105, 10);
  });

  it("calculates cost for openai gpt-5-mini", () => {
    const cost = calculateCost("openai", "gpt-5-mini", 1000, 500);
    // 1000 * (0.25/1M) + 500 * (2/1M) = 0.00025 + 0.001 = 0.00125
    expect(cost).toBeCloseTo(0.00125, 10);
  });

  it("calculates cost for openai gpt-5.4-mini", () => {
    const cost = calculateCost("openai", "gpt-5.4-mini", 1000, 500);
    // 1000 * (0.75/1M) + 500 * (4.5/1M) = 0.00075 + 0.00225 = 0.003
    expect(cost).toBeCloseTo(0.003, 10);
  });

  it("calculates cost for openai gpt-5.4-nano", () => {
    const cost = calculateCost("openai", "gpt-5.4-nano", 1000, 500);
    // 1000 * (0.2/1M) + 500 * (1.25/1M) = 0.0002 + 0.000625 = 0.000825
    expect(cost).toBeCloseTo(0.000825, 10);
  });

  it("calculates cost for google gemini-3-flash-preview", () => {
    const cost = calculateCost("google", "gemini-3-flash-preview", 1000, 500);
    // 1000 * (0.5/1M) + 500 * (3/1M) = 0.0005 + 0.0015 = 0.002
    expect(cost).toBeCloseTo(0.002, 10);
  });

  it("returns undefined for unknown model", () => {
    expect(calculateCost("anthropic", "unknown-model", 100, 50)).toBeUndefined();
  });

  it("returns undefined for unknown provider", () => {
    expect(calculateCost("unknown", "gpt-5-mini", 100, 50)).toBeUndefined();
  });

  it("returns 0 for zero tokens", () => {
    expect(calculateCost("anthropic", "claude-sonnet-4-6", 0, 0)).toBe(0);
  });
});
