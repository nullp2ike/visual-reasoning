// Smoke tests for Google provider — hits real Gemini API.
// Estimated cost per run: ~$0.001-0.003 (4 API calls with Gemini 2.5 Flash)
// Requires GOOGLE_API_KEY in .env
// Run with: pnpm test:smoke

import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { visualAI } from "../../src/core/client.js";
import type { CheckResult, AskResult } from "../../src/types.js";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");
const COST_LIMIT = 0.05;

let image: Buffer;

beforeAll(async () => {
  image = await readFile(join(FIXTURES_DIR, "app-screenshot.png"));
});

function assertCheckStructure(result: CheckResult): void {
  expect(result.pass).toBeTypeOf("boolean");
  expect(result.reasoning).toBeTypeOf("string");
  expect(result.reasoning.length).toBeGreaterThan(0);
  expect(Array.isArray(result.issues)).toBe(true);
  expect(Array.isArray(result.statements)).toBe(true);
}

function assertAskStructure(result: AskResult): void {
  expect(result.summary).toBeTypeOf("string");
  expect(result.summary.length).toBeGreaterThan(0);
  expect(Array.isArray(result.issues)).toBe(true);
}

function assertUsageTracked(result: CheckResult | AskResult): void {
  expect(result.usage).toBeDefined();
  expect(result.usage!.inputTokens).toBeGreaterThan(0);
  expect(result.usage!.outputTokens).toBeGreaterThan(0);
  expect(result.usage!.estimatedCost).toBeTypeOf("number");
  expect(result.usage!.estimatedCost!).toBeLessThan(COST_LIMIT);
  expect(result.usage!.durationSeconds).toBeTypeOf("number");
  expect(result.usage!.durationSeconds!).toBeGreaterThan(0);
  expect(result.usage!.durationSeconds!).toBeLessThan(30);
}

describe("smoke: Google provider", () => {
  const ai = visualAI({ model: "gemini-3-flash-preview", trackUsage: true });

  it("check() — positive assertion", async () => {
    const result = await ai.check(image, "Category icons are visible on the screen");

    assertCheckStructure(result);
    assertUsageTracked(result);
    expect(result.pass).toBe(true);
  });

  it("check() — negative assertion", async () => {
    const result = await ai.check(
      image,
      "A login form with username and password fields is visible",
    );

    assertCheckStructure(result);
    assertUsageTracked(result);
    expect(result.pass).toBe(false);
  });

  it("ask() — describes screen layout", async () => {
    const result = await ai.ask(image, "Describe the layout of this screen");

    assertAskStructure(result);
    assertUsageTracked(result);
  });

  it("compare() — same image returns pass", async () => {
    const result = await ai.compare(image, image, {
      prompt: "Are these two screenshots the same?",
    });

    assertCheckStructure(result);
    assertUsageTracked(result);
    expect(result.pass).toBe(true);
  });
});
