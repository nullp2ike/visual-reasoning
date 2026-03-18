import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { Model } from "../../src/constants.js";
import { visualAI } from "../../src/core/client.js";
import { VisualAIConfigError, VisualAIResponseParseError } from "../../src/errors.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures");

// Mock all three provider SDKs
const mockAnthropicCreate = vi.fn();
const mockOpenAICreate = vi.fn();
const mockGoogleGenerate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    constructor(_opts: Record<string, unknown>) {}
    messages = { create: mockAnthropicCreate };
  },
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_opts: Record<string, unknown>) {}
    responses = { create: mockOpenAICreate };
  },
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class MockGoogleGenAI {
    constructor(_opts: Record<string, unknown>) {}
    models = { generateContent: mockGoogleGenerate };
  },
}));

function makeCheckResponse(pass: boolean) {
  return JSON.stringify({
    pass,
    reasoning: pass ? "All checks passed" : "Some checks failed",
    issues: pass
      ? []
      : [
          {
            priority: "major",
            category: "missing-element",
            description: "Element not found",
            suggestion: "Add the element",
          },
        ],
    statements: [{ statement: "Test statement", pass, reasoning: pass ? "Found" : "Not found" }],
  });
}

function makeCompareResponse(pass: boolean) {
  return JSON.stringify({
    pass,
    reasoning: pass ? "No visual changes detected" : "2 changes detected",
    changes: pass
      ? []
      : [
          { description: "Button removed", severity: "critical" },
          { description: "Color changed", severity: "minor" },
        ],
  });
}

function makeQueryResponse() {
  return JSON.stringify({
    summary: "Found 1 issue",
    issues: [
      {
        priority: "minor",
        category: "content",
        description: "Placeholder text visible",
        suggestion: "Replace with real content",
      },
    ],
  });
}

async function makeFakePngBase64(
  width: number,
  height: number,
  background: { r: number; g: number; b: number; alpha: number },
) {
  return (
    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background,
      },
    })
      .png()
      .toBuffer()
  ).toString("base64");
}

describe("visualAI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("provider resolution", () => {
    const savedAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const savedOpenaiKey = process.env.OPENAI_API_KEY;
    const savedGoogleKey = process.env.GOOGLE_API_KEY;

    beforeEach(() => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
    });

    afterEach(() => {
      process.env.ANTHROPIC_API_KEY = savedAnthropicKey!;
      process.env.OPENAI_API_KEY = savedOpenaiKey!;
      process.env.GOOGLE_API_KEY = savedGoogleKey!;
      if (savedAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      if (savedOpenaiKey === undefined) delete process.env.OPENAI_API_KEY;
      if (savedGoogleKey === undefined) delete process.env.GOOGLE_API_KEY;
    });

    it("auto-detects anthropic from ANTHROPIC_API_KEY", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-test";
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const ai = visualAI();
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      expect(mockAnthropicCreate).toHaveBeenCalled();
    });

    it("auto-detects openai from OPENAI_API_KEY", async () => {
      process.env.OPENAI_API_KEY = "sk-test";
      mockOpenAICreate.mockResolvedValueOnce({
        output_text: makeCheckResponse(true),
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const ai = visualAI();
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      expect(mockOpenAICreate).toHaveBeenCalled();
    });

    it("auto-detects google from GOOGLE_API_KEY", async () => {
      process.env.GOOGLE_API_KEY = "test-key";
      mockGoogleGenerate.mockResolvedValueOnce({
        text: makeCheckResponse(true),
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      });

      const ai = visualAI();
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      expect(mockGoogleGenerate).toHaveBeenCalled();
    });

    it("infers anthropic from known model in config", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      expect(mockAnthropicCreate).toHaveBeenCalled();
    });

    it("infers openai from known model in config", async () => {
      mockOpenAICreate.mockResolvedValueOnce({
        output_text: makeCheckResponse(true),
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const ai = visualAI({ model: "gpt-5-mini", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      expect(mockOpenAICreate).toHaveBeenCalled();
    });

    it("infers google from known model in config", async () => {
      mockGoogleGenerate.mockResolvedValueOnce({
        text: makeCheckResponse(true),
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      });

      const ai = visualAI({ model: "gemini-2.5-flash", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      expect(mockGoogleGenerate).toHaveBeenCalled();
    });

    it("infers provider from model prefix for unknown models", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const ai = visualAI({ model: "claude-future-model", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      expect(mockAnthropicCreate).toHaveBeenCalled();
    });

    it("infers provider from VISUAL_AI_MODEL env var", async () => {
      process.env.VISUAL_AI_MODEL = "gpt-5-mini";
      mockOpenAICreate.mockResolvedValueOnce({
        output_text: makeCheckResponse(true),
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const ai = visualAI({ apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      expect(mockOpenAICreate).toHaveBeenCalled();
      delete process.env.VISUAL_AI_MODEL;
    });

    it("falls through to API key detection when model has no recognizable prefix", async () => {
      process.env.GOOGLE_API_KEY = "test-key";
      mockGoogleGenerate.mockResolvedValueOnce({
        text: makeCheckResponse(true),
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      });

      const ai = visualAI({ model: "some-custom-model" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      expect(mockGoogleGenerate).toHaveBeenCalled();
    });

    it("throws when no provider can be determined", () => {
      expect(() => visualAI()).toThrow(VisualAIConfigError);
      expect(() => visualAI()).toThrow(/Cannot determine provider/);
    });
  });

  describe("model resolution", () => {
    const savedModel = process.env.VISUAL_AI_MODEL;

    afterEach(() => {
      if (savedModel === undefined) {
        delete process.env.VISUAL_AI_MODEL;
      } else {
        process.env.VISUAL_AI_MODEL = savedModel;
      }
    });

    it("uses VISUAL_AI_MODEL env var when no config model specified", async () => {
      process.env.VISUAL_AI_MODEL = "claude-opus-4-0-20250918";
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const ai = visualAI({ apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      expect(callArgs.model).toBe("claude-opus-4-0-20250918");
    });

    it("config model takes precedence over VISUAL_AI_MODEL env var", async () => {
      process.env.VISUAL_AI_MODEL = "claude-opus-4-0-20250918";
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const ai = visualAI({
        apiKey: "test",
        model: "claude-haiku-3-5-20241022",
      });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      expect(callArgs.model).toBe("claude-haiku-3-5-20241022");
    });
  });

  describe("check()", () => {
    it("returns CheckResult with single statement", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.check(image, "Test statement");

      expect(result.pass).toBe(true);
      expect(result.statements).toHaveLength(1);
      expect(result.usage).toBeDefined();
      expect(result.usage?.inputTokens).toBe(100);
      expect(result.usage?.outputTokens).toBe(50);
      expect(result.usage?.estimatedCost).toBeCloseTo(0.00105, 6);
      expect(result.usage?.durationSeconds).toBeTypeOf("number");
      expect(result.usage!.durationSeconds!).toBeGreaterThanOrEqual(0);
    });

    it("returns CheckResult with multiple statements", async () => {
      const response = JSON.stringify({
        pass: false,
        reasoning: "1 of 2 failed",
        issues: [
          {
            priority: "major",
            category: "missing-element",
            description: "Missing",
            suggestion: "Add it",
          },
        ],
        statements: [
          { statement: "A", pass: true, reasoning: "ok" },
          { statement: "B", pass: false, reasoning: "missing" },
        ],
      });

      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: response }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.check(image, ["A", "B"]);

      expect(result.pass).toBe(false);
      expect(result.statements).toHaveLength(2);
    });

    it("throws on malformed AI response", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "not json" }],
        usage: { input_tokens: 0, output_tokens: 0 },
      });

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await expect(ai.check(image, "test")).rejects.toThrow(VisualAIResponseParseError);
    });
  });

  describe("ask()", () => {
    it("returns AskResult", async () => {
      mockOpenAICreate.mockResolvedValueOnce({
        output_text: makeQueryResponse(),
        usage: { input_tokens: 200, output_tokens: 100 },
      });

      const ai = visualAI({ model: "gpt-5-mini", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.ask(image, "Analyze this page");

      expect(result.summary).toBe("Found 1 issue");
      expect(result.issues).toHaveLength(1);
      expect(result.usage).toBeDefined();
      expect(result.usage?.inputTokens).toBe(200);
      expect(result.usage?.outputTokens).toBe(100);
      // 200 * (0.25/1M) + 100 * (2/1M) = 0.00005 + 0.0002 = 0.00025
      expect(result.usage?.estimatedCost).toBeCloseTo(0.00025, 10);
      expect(result.usage?.durationSeconds).toBeTypeOf("number");
      expect(result.usage!.durationSeconds!).toBeGreaterThanOrEqual(0);
    });

    it("passes instructions to prompt builder", async () => {
      mockOpenAICreate.mockResolvedValueOnce({
        output_text: makeQueryResponse(),
        usage: { input_tokens: 200, output_tokens: 100 },
      });

      const ai = visualAI({ model: "gpt-5-mini", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.ask(image, "Analyze this page", {
        instructions: ["Ignore decorative elements"],
      });

      const callArgs = JSON.stringify(mockOpenAICreate.mock.calls[0][0]);
      expect(callArgs).toContain("Ignore decorative elements");
    });
  });

  describe("compare()", () => {
    it("returns CompareResult for two images", async () => {
      mockGoogleGenerate.mockResolvedValueOnce({
        text: makeCompareResponse(false),
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 150 },
      });

      const ai = visualAI({ model: "gemini-custom-v1", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.compare(image, image, { prompt: "Describe differences" });

      expect(result.pass).toBe(false);
      expect(result.changes).toHaveLength(2);
      expect(result.changes[0]!.severity).toBe("critical");
    });

    it("works without user prompt", async () => {
      mockGoogleGenerate.mockResolvedValueOnce({
        text: makeCompareResponse(true),
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 150 },
      });

      const ai = visualAI({ model: "gemini-custom-v1", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.compare(image, image);

      expect(result.pass).toBe(true);
      expect(result.changes).toHaveLength(0);
    });

    it("returns default AI diff image for gemini-3-flash-preview", async () => {
      mockGoogleGenerate.mockResolvedValueOnce({
        text: makeCompareResponse(false),
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 150 },
      });

      mockGoogleGenerate.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: await makeFakePngBase64(20, 20, { r: 255, g: 0, b: 0, alpha: 1 }),
                    mimeType: "image/png",
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 200 },
      });

      const ai = visualAI({
        model: Model.Google.GEMINI_3_FLASH_PREVIEW,
        apiKey: "test",
      });
      const image = await readFile(join(FIXTURES_DIR, "diff-base.png"));
      const result = await ai.compare(image, image);

      expect(result.diffImage).toBeDefined();
      expect(result.diffImage!.mimeType).toBe("image/png");
      expect(result.diffImage!.width).toBe(20);
      expect(result.diffImage!.height).toBe(20);
    });

    it("returns no default AI diff image for gemini-3.1-pro-preview", async () => {
      mockGoogleGenerate.mockResolvedValueOnce({
        text: makeCompareResponse(true),
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 150 },
      });

      const ai = visualAI({
        model: Model.Google.GEMINI_3_1_PRO_PREVIEW,
        apiKey: "test",
      });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.compare(image, image);

      expect(result.diffImage).toBeUndefined();
      expect(mockGoogleGenerate).toHaveBeenCalledTimes(1);
    });

    it("returns no diffImage when diffImage false disables Gemini preview default", async () => {
      mockGoogleGenerate.mockResolvedValueOnce({
        text: makeCompareResponse(true),
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 150 },
      });

      const ai = visualAI({
        model: Model.Google.GEMINI_3_FLASH_PREVIEW,
        apiKey: "test",
      });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.compare(image, image, { diffImage: false });

      expect(result.diffImage).toBeUndefined();
      expect(mockGoogleGenerate).toHaveBeenCalledTimes(1);
    });

    it("returns no diffImage when option is not provided for non-preview Google model", async () => {
      mockGoogleGenerate.mockResolvedValueOnce({
        text: makeCompareResponse(true),
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 150 },
      });

      const ai = visualAI({ model: "gemini-custom-v1", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.compare(image, image);

      expect(result.diffImage).toBeUndefined();
    });

    it("returns AI diff image when diffImage is true (Google provider)", async () => {
      // First call: AI comparison text response
      mockGoogleGenerate.mockResolvedValueOnce({
        text: makeCompareResponse(false),
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 150 },
      });

      // Second call: image generation response
      mockGoogleGenerate.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: await makeFakePngBase64(20, 20, { r: 255, g: 0, b: 0, alpha: 1 }),
                    mimeType: "image/png",
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 200 },
      });

      const ai = visualAI({ model: "gemini-3-flash-preview", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "diff-base.png"));
      const result = await ai.compare(image, image, {
        diffImage: true,
      });

      expect(result.pass).toBe(false);
      expect(result.diffImage).toBeDefined();
      expect(result.diffImage!.mimeType).toBe("image/png");
      expect(result.diffImage!.width).toBe(20);
      expect(result.diffImage!.height).toBe(20);
      expect(result.diffImage!.data).toBeInstanceOf(Buffer);
    });

    it("uses gemini-3-flash-preview for AI diff generation", async () => {
      mockGoogleGenerate.mockResolvedValueOnce({
        text: makeCompareResponse(false),
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 150 },
      });

      mockGoogleGenerate.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: await makeFakePngBase64(10, 10, { r: 0, g: 255, b: 0, alpha: 1 }),
                    mimeType: "image/png",
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 200 },
      });

      const ai = visualAI({
        model: Model.Google.GEMINI_3_FLASH_PREVIEW,
        apiKey: "test",
      });
      const image = await readFile(join(FIXTURES_DIR, "diff-base.png"));
      const result = await ai.compare(image, image, {
        diffImage: true,
      });

      expect(result.diffImage).toBeDefined();
      expect(result.diffImage!.mimeType).toBe("image/png");
      expect(result.diffImage!.data).toBeInstanceOf(Buffer);
      expect(mockGoogleGenerate).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          model: Model.Google.GEMINI_3_FLASH_PREVIEW,
        }),
      );
    });

    it("returns no diffImage when diffImage is true for unsupported Google models", async () => {
      mockGoogleGenerate.mockResolvedValueOnce({
        text: makeCompareResponse(true),
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 150 },
      });

      const ai = visualAI({
        model: Model.Google.GEMINI_3_1_PRO_PREVIEW,
        apiKey: "test",
      });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.compare(image, image, {
        diffImage: true,
      });

      expect(result.diffImage).toBeUndefined();
      expect(mockGoogleGenerate).toHaveBeenCalledTimes(1);
    });

    it("gracefully degrades when diffImage used with non-Google provider", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCompareResponse(true) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.compare(image, image, { diffImage: true });
      expect(result.pass).toBe(true);
      expect(result.diffImage).toBeUndefined();
    });
  });

  describe("reasoning effort", () => {
    it("passes reasoningEffort to anthropic driver", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const ai = visualAI({
        model: "claude-sonnet-4-6",
        apiKey: "test",
        reasoningEffort: "high",
      });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      expect(callArgs).toHaveProperty("thinking", { type: "adaptive" });
      expect(callArgs).toHaveProperty("output_config", { effort: "high" });
    });

    it("passes reasoningEffort to openai driver", async () => {
      mockOpenAICreate.mockResolvedValueOnce({
        output_text: makeCheckResponse(true),
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const ai = visualAI({
        model: "gpt-5-mini",
        apiKey: "test",
        reasoningEffort: "low",
      });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const callArgs = mockOpenAICreate.mock.calls[0][0];
      expect(callArgs).toHaveProperty("reasoning", { effort: "low" });
    });

    it("passes reasoningEffort to google driver", async () => {
      mockGoogleGenerate.mockResolvedValueOnce({
        text: makeCheckResponse(true),
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      });

      const ai = visualAI({
        model: "gemini-3-flash-preview",
        apiKey: "test",
        reasoningEffort: "medium",
      });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const callArgs = mockGoogleGenerate.mock.calls[0][0];
      expect(callArgs.config).toHaveProperty("thinkingConfig", { thinkingBudget: 8192 });
    });
  });

  describe("debug mode", () => {
    it("logs to stderr when debug is true", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 0, output_tokens: 0 },
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test", debug: true });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      expect(stderrSpy).toHaveBeenCalled();
      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("check prompt"))).toBe(true);
      expect(calls.some((c) => c.includes("check response"))).toBe(true);

      stderrSpy.mockRestore();
    });
  });

  describe("usage tracking", () => {
    it("logs usage to stderr when trackUsage is true", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test", trackUsage: true });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("check usage:"))).toBe(true);
      expect(calls.some((c) => c.includes("100 input + 50 output tokens"))).toBe(true);
      expect(calls.some((c) => c.includes("$"))).toBe(true);

      stderrSpy.mockRestore();
    });

    it("suppresses usage logging by default", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("usage:"))).toBe(false);

      stderrSpy.mockRestore();
    });

    it("suppresses usage logging when trackUsage is false", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test", trackUsage: false });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("usage:"))).toBe(false);

      stderrSpy.mockRestore();
    });

    it("includes estimatedCost in result for known models", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 1000, output_tokens: 500 },
      });

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test", trackUsage: false });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.check(image, "test");

      expect(result.usage?.estimatedCost).toBeCloseTo(0.0105, 6);
    });

    it("returns undefined estimatedCost for unknown models", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const ai = visualAI({
        apiKey: "test",
        model: "claude-custom-v1",
        trackUsage: false,
      });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.check(image, "test");

      expect(result.usage?.estimatedCost).toBeUndefined();
    });

    it("logs 'unknown' cost for unknown models", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({
        apiKey: "test",
        model: "claude-custom-v1",
        trackUsage: true,
      });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("(unknown)"))).toBe(true);

      stderrSpy.mockRestore();
    });

    it("includes durationSeconds computed from performance.now()", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const perfSpy = vi.spyOn(performance, "now");
      perfSpy.mockReturnValueOnce(1000);
      perfSpy.mockReturnValueOnce(3500);

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.check(image, "test");

      expect(result.usage?.durationSeconds).toBe(2.5);

      perfSpy.mockRestore();
      stderrSpy.mockRestore();
    });

    it("logs duration in stderr usage line", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const perfSpy = vi.spyOn(performance, "now");
      perfSpy.mockReturnValueOnce(0);
      perfSpy.mockReturnValueOnce(1234);

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test", trackUsage: true });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("in 1.234s"))).toBe(true);

      perfSpy.mockRestore();
      stderrSpy.mockRestore();
    });

    it("includes durationSeconds even when trackUsage is false", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test", trackUsage: false });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.check(image, "test");

      expect(result.usage?.durationSeconds).toBeTypeOf("number");
      expect(result.usage!.durationSeconds!).toBeGreaterThanOrEqual(0);

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("in "))).toBe(false);

      stderrSpy.mockRestore();
    });

    it("returns usage with durationSeconds even when provider omits usage data", async () => {
      mockOpenAICreate.mockResolvedValueOnce({
        output_text: makeCheckResponse(true),
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "gpt-5-mini", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.check(image, "test");

      expect(result.usage).toBeDefined();
      expect(result.usage!.inputTokens).toBe(0);
      expect(result.usage!.outputTokens).toBe(0);
      expect(result.usage!.durationSeconds).toBeTypeOf("number");
      expect(result.usage!.durationSeconds!).toBeGreaterThanOrEqual(0);

      stderrSpy.mockRestore();
    });

    it("debug and usage logging are independent", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({
        model: "claude-sonnet-4-6",
        apiKey: "test",
        debug: false,
        trackUsage: true,
      });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("check usage:"))).toBe(true);
      expect(calls.some((c) => c.includes("check prompt"))).toBe(false);

      stderrSpy.mockRestore();
    });
  });

  describe("boolean env var config", () => {
    const savedDebug = process.env.VISUAL_AI_DEBUG;
    const savedTrackUsage = process.env.VISUAL_AI_TRACK_USAGE;

    beforeEach(() => {
      delete process.env.VISUAL_AI_DEBUG;
      delete process.env.VISUAL_AI_TRACK_USAGE;
    });

    afterEach(() => {
      if (savedDebug === undefined) delete process.env.VISUAL_AI_DEBUG;
      else process.env.VISUAL_AI_DEBUG = savedDebug;
      if (savedTrackUsage === undefined) delete process.env.VISUAL_AI_TRACK_USAGE;
      else process.env.VISUAL_AI_TRACK_USAGE = savedTrackUsage;
    });

    it("VISUAL_AI_DEBUG=true enables debug logging", async () => {
      process.env.VISUAL_AI_DEBUG = "true";
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 0, output_tokens: 0 },
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("check prompt"))).toBe(true);

      stderrSpy.mockRestore();
    });

    it("VISUAL_AI_DEBUG=1 enables debug logging", async () => {
      process.env.VISUAL_AI_DEBUG = "1";
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 0, output_tokens: 0 },
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("check prompt"))).toBe(true);

      stderrSpy.mockRestore();
    });

    it("VISUAL_AI_DEBUG=false suppresses debug logging", async () => {
      process.env.VISUAL_AI_DEBUG = "false";
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 0, output_tokens: 0 },
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("check prompt"))).toBe(false);

      stderrSpy.mockRestore();
    });

    it("config.debug takes precedence over VISUAL_AI_DEBUG", async () => {
      process.env.VISUAL_AI_DEBUG = "true";
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 0, output_tokens: 0 },
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test", debug: false });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("check prompt"))).toBe(false);

      stderrSpy.mockRestore();
    });

    it("VISUAL_AI_TRACK_USAGE=true enables usage logging", async () => {
      process.env.VISUAL_AI_TRACK_USAGE = "true";
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("check usage:"))).toBe(true);

      stderrSpy.mockRestore();
    });

    it("VISUAL_AI_TRACK_USAGE=1 enables usage logging", async () => {
      process.env.VISUAL_AI_TRACK_USAGE = "1";
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("check usage:"))).toBe(true);

      stderrSpy.mockRestore();
    });

    it("VISUAL_AI_TRACK_USAGE=false suppresses usage logging", async () => {
      process.env.VISUAL_AI_TRACK_USAGE = "false";
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("usage:"))).toBe(false);

      stderrSpy.mockRestore();
    });

    it("config.trackUsage takes precedence over VISUAL_AI_TRACK_USAGE", async () => {
      process.env.VISUAL_AI_TRACK_USAGE = "true";
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test", trackUsage: false });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("usage:"))).toBe(false);

      stderrSpy.mockRestore();
    });

    it("throws on invalid boolean env value", () => {
      process.env.VISUAL_AI_DEBUG = "maybe";
      expect(() => visualAI({ model: "claude-sonnet-4-6", apiKey: "test" })).toThrow(
        VisualAIConfigError,
      );
      expect(() => visualAI({ model: "claude-sonnet-4-6", apiKey: "test" })).toThrow(
        /Invalid VISUAL_AI_DEBUG value/,
      );
    });

    it("unset env var falls through to default (false)", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makeCheckResponse(true) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      await ai.check(image, "test");

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("check prompt"))).toBe(false);
      expect(calls.some((c) => c.includes("usage:"))).toBe(false);

      stderrSpy.mockRestore();
    });
  });
});
