import { describe, it, expect } from "vitest";
import { calculateCost } from "../../src/core/pricing.js";

describe("calculateCost", () => {
  it("calculates cost for anthropic claude-fable-5", () => {
    const cost = calculateCost("anthropic", "claude-fable-5", 1000, 500);
    // 1000 * (10/1M) + 500 * (50/1M) = 0.01 + 0.025 = 0.035
    expect(cost).toBeCloseTo(0.035, 10);
  });

  it("calculates cost for anthropic claude-opus-4-8", () => {
    const cost = calculateCost("anthropic", "claude-opus-4-8", 1000, 500);
    // 1000 * (5/1M) + 500 * (25/1M) = 0.005 + 0.0125 = 0.0175
    expect(cost).toBeCloseTo(0.0175, 10);
  });

  it("calculates cost for anthropic claude-sonnet-5", () => {
    const cost = calculateCost("anthropic", "claude-sonnet-5", 1000, 500);
    // 1000 * (3/1M) + 500 * (15/1M) = 0.003 + 0.0075 = 0.0105
    expect(cost).toBeCloseTo(0.0105, 10);
  });

  it("calculates cost for anthropic claude-opus-4-7", () => {
    const cost = calculateCost("anthropic", "claude-opus-4-7", 1000, 500);
    // 1000 * (5/1M) + 500 * (25/1M) = 0.005 + 0.0125 = 0.0175
    expect(cost).toBeCloseTo(0.0175, 10);
  });

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

  it("calculates cost for openai gpt-5.6-sol", () => {
    const cost = calculateCost("openai", "gpt-5.6-sol", 1000, 500);
    // 1000 * (5/1M) + 500 * (30/1M) = 0.005 + 0.015 = 0.02
    expect(cost).toBeCloseTo(0.02, 10);
  });

  it("calculates cost for openai gpt-5.6-terra", () => {
    const cost = calculateCost("openai", "gpt-5.6-terra", 1000, 500);
    // 1000 * (2.5/1M) + 500 * (15/1M) = 0.0025 + 0.0075 = 0.01
    expect(cost).toBeCloseTo(0.01, 10);
  });

  it("calculates cost for openai gpt-5.6-luna", () => {
    const cost = calculateCost("openai", "gpt-5.6-luna", 1000, 500);
    // 1000 * (1/1M) + 500 * (6/1M) = 0.001 + 0.003 = 0.004
    expect(cost).toBeCloseTo(0.004, 10);
  });

  it("calculates cost for openai gpt-5.5", () => {
    const cost = calculateCost("openai", "gpt-5.5", 1000, 500);
    // 1000 * (5/1M) + 500 * (30/1M) = 0.005 + 0.015 = 0.02
    expect(cost).toBeCloseTo(0.02, 10);
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

  it("calculates cost for google gemini-3.6-flash", () => {
    const cost = calculateCost("google", "gemini-3.6-flash", 1000, 500);
    // 1000 * (1.5/1M) + 500 * (7.5/1M) = 0.0015 + 0.00375 = 0.00525
    expect(cost).toBeCloseTo(0.00525, 10);
  });

  it("calculates cost for google gemini-3.5-flash", () => {
    const cost = calculateCost("google", "gemini-3.5-flash", 1000, 500);
    // 1000 * (1.5/1M) + 500 * (9/1M) = 0.0015 + 0.0045 = 0.006
    expect(cost).toBeCloseTo(0.006, 10);
  });

  it("calculates cost for google gemini-3.5-flash-lite", () => {
    const cost = calculateCost("google", "gemini-3.5-flash-lite", 1000, 500);
    // 1000 * (0.3/1M) + 500 * (2.5/1M) = 0.0003 + 0.00125 = 0.00155
    expect(cost).toBeCloseTo(0.00155, 10);
  });

  it("calculates cost for google gemini-3.1-flash-lite", () => {
    const cost = calculateCost("google", "gemini-3.1-flash-lite", 1000, 500);
    // 1000 * (0.25/1M) + 500 * (1.5/1M) = 0.00025 + 0.00075 = 0.001
    expect(cost).toBeCloseTo(0.001, 10);
  });

  it("calculates cost for google gemini-3-flash-preview", () => {
    const cost = calculateCost("google", "gemini-3-flash-preview", 1000, 500);
    // 1000 * (0.5/1M) + 500 * (3/1M) = 0.0005 + 0.0015 = 0.002
    expect(cost).toBeCloseTo(0.002, 10);
  });

  it("calculates cost for openrouter x-ai/grok-4.5", () => {
    const cost = calculateCost("openrouter", "x-ai/grok-4.5", 1000, 500);
    // 1000 * (2/1M) + 500 * (6/1M) = 0.002 + 0.003 = 0.005
    expect(cost).toBeCloseTo(0.005, 10);
  });

  it("calculates cost for openrouter moonshotai/kimi-k3", () => {
    const cost = calculateCost("openrouter", "moonshotai/kimi-k3", 1000, 500);
    // 1000 * (3/1M) + 500 * (15/1M) = 0.003 + 0.0075 = 0.0105
    expect(cost).toBeCloseTo(0.0105, 10);
  });

  it("calculates cost for openrouter moonshotai/kimi-k2.7-code", () => {
    const cost = calculateCost("openrouter", "moonshotai/kimi-k2.7-code", 1000, 500);
    // 1000 * (0.82/1M) + 500 * (3.75/1M) = 0.00082 + 0.001875 = 0.002695
    expect(cost).toBeCloseTo(0.002695, 10);
  });

  it("calculates cost for openrouter qwen/qwen3.7-plus", () => {
    const cost = calculateCost("openrouter", "qwen/qwen3.7-plus", 1000, 500);
    // 1000 * (0.32/1M) + 500 * (1.28/1M) = 0.00032 + 0.00064 = 0.00096
    expect(cost).toBeCloseTo(0.00096, 10);
  });

  it("calculates cost for openrouter qwen/qwen3.6-flash", () => {
    const cost = calculateCost("openrouter", "qwen/qwen3.6-flash", 1000, 500);
    // 1000 * (0.1875/1M) + 500 * (1.125/1M) = 0.0001875 + 0.0005625 = 0.00075
    expect(cost).toBeCloseTo(0.00075, 10);
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
