import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { visualAI } from "../../src/core/client.js";
import {
  VisualAIAuthError,
  VisualAIRateLimitError,
  VisualAIResponseParseError,
  VisualAIImageError,
} from "../../src/errors.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures");

// Mock SDKs
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

const PASSING_CHECK = JSON.stringify({
  pass: true,
  reasoning: "All checks passed",
  issues: [],
  statements: [{ statement: "Page loaded", pass: true, reasoning: "Content visible" }],
});

const FAILING_CHECK = JSON.stringify({
  pass: false,
  reasoning: "1 of 2 checks failed",
  issues: [
    {
      priority: "critical",
      category: "accessibility",
      description: "Low contrast text on header",
      suggestion: "Increase text contrast to 4.5:1 minimum",
    },
  ],
  statements: [
    { statement: "Page loaded", pass: true, reasoning: "Content visible" },
    { statement: "Contrast OK", pass: false, reasoning: "Header text has 2.1:1 contrast ratio" },
  ],
});

const FAILING_COMPARE = JSON.stringify({
  pass: false,
  reasoning: "2 changes detected",
  changes: [
    { description: "Button removed from header", severity: "critical" },
    { description: "Background color changed", severity: "minor" },
  ],
});

const QUERY_RESULT = JSON.stringify({
  summary: "Found 2 issues on the page",
  issues: [
    {
      priority: "critical",
      category: "accessibility",
      description: "Button has no visible focus state",
      suggestion: "Add :focus-visible outline",
    },
    {
      priority: "minor",
      category: "content",
      description: "Lorem ipsum text in footer",
      suggestion: "Replace with actual content",
    },
  ],
});

describe("integration: full flow per provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Anthropic provider", () => {
    it("check() full flow: image → prompt → response → validated result", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: PASSING_CHECK }],
        usage: { input_tokens: 500, output_tokens: 200 },
      });

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test-key" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.check(image, "Page loaded");

      expect(result.pass).toBe(true);
      expect(result.reasoning).toContain("passed");
      expect(result.issues).toHaveLength(0);
      expect(result.statements).toHaveLength(1);
      expect(result.usage).toMatchObject({ inputTokens: 500, outputTokens: 200 });
      expect(result.usage?.estimatedCost).toBeTypeOf("number");
      expect(result.usage?.durationSeconds).toBeTypeOf("number");
      expect(result.usage!.durationSeconds!).toBeGreaterThanOrEqual(0);
    });

    it("check() with failing assertion", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: FAILING_CHECK }],
        usage: { input_tokens: 500, output_tokens: 300 },
      });

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test-key" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.check(image, ["Page loaded", "Contrast OK"]);

      expect(result.pass).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]!.priority).toBe("critical");
      expect(result.issues[0]!.category).toBe("accessibility");
      expect(result.statements).toHaveLength(2);
      expect(result.statements[0]!.pass).toBe(true);
      expect(result.statements[1]!.pass).toBe(false);
    });

    it("ask() full flow", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: QUERY_RESULT }],
        usage: { input_tokens: 500, output_tokens: 250 },
      });

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test-key" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.ask(image, "Analyze this page for issues");

      expect(result.summary).toContain("2 issues");
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0]!.priority).toBe("critical");
      expect(result.issues[1]!.priority).toBe("minor");
    });
  });

  describe("OpenAI provider", () => {
    it("check() full flow", async () => {
      mockOpenAICreate.mockResolvedValueOnce({
        output_text: PASSING_CHECK,
        usage: { input_tokens: 400, output_tokens: 150 },
      });

      const ai = visualAI({ model: "gpt-5-mini", apiKey: "test-key" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.check(image, "Page loaded");

      expect(result.pass).toBe(true);
      expect(result.usage).toMatchObject({ inputTokens: 400, outputTokens: 150 });
      expect(result.usage?.estimatedCost).toBeTypeOf("number");
      expect(result.usage?.durationSeconds).toBeTypeOf("number");
      expect(result.usage!.durationSeconds!).toBeGreaterThanOrEqual(0);
    });

    it("ask() full flow", async () => {
      mockOpenAICreate.mockResolvedValueOnce({
        output_text: QUERY_RESULT,
        usage: { input_tokens: 400, output_tokens: 200 },
      });

      const ai = visualAI({ model: "gpt-5-mini", apiKey: "test-key" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.ask(image, "Analyze this page");

      expect(result.summary).toContain("2 issues");
      expect(result.issues).toHaveLength(2);
    });
  });

  describe("Google provider", () => {
    it("check() full flow", async () => {
      mockGoogleGenerate.mockResolvedValueOnce({
        text: PASSING_CHECK,
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 100 },
      });

      const ai = visualAI({ model: "gemini-3-flash-preview", apiKey: "test-key" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await ai.check(image, "Page loaded");

      expect(result.pass).toBe(true);
      expect(result.usage).toMatchObject({ inputTokens: 300, outputTokens: 100 });
      expect(result.usage?.estimatedCost).toBeTypeOf("number");
      expect(result.usage?.durationSeconds).toBeTypeOf("number");
      expect(result.usage!.durationSeconds!).toBeGreaterThanOrEqual(0);
    });

    it("compare() full flow with two images", async () => {
      mockGoogleGenerate.mockResolvedValueOnce({
        text: FAILING_COMPARE,
        usageMetadata: { promptTokenCount: 600, candidatesTokenCount: 200 },
      });

      const ai = visualAI({ model: "gemini-3-flash-preview", apiKey: "test-key" });
      const before = await readFile(join(FIXTURES_DIR, "small.png"));
      const after = await readFile(join(FIXTURES_DIR, "small.jpg"));
      const result = await ai.compare(before, after, { prompt: "What changed?" });

      expect(result.pass).toBe(false);
      expect(result.changes).toHaveLength(2);
      expect(result.changes[0]!.severity).toBe("critical");
    });
  });
});

describe("integration: error flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auth failure → VisualAIAuthError", async () => {
    const err = Object.assign(new Error("Invalid API key"), { status: 401 });
    mockAnthropicCreate.mockRejectedValueOnce(err);

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "bad-key" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    await expect(ai.check(image, "test")).rejects.toThrow(VisualAIAuthError);
  });

  it("rate limit → VisualAIRateLimitError", async () => {
    const err = Object.assign(new Error("Rate limited"), { status: 429 });
    mockOpenAICreate.mockRejectedValueOnce(err);

    const ai = visualAI({ model: "gpt-5-mini", apiKey: "test-key" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    await expect(ai.check(image, "test")).rejects.toThrow(VisualAIRateLimitError);
  });

  it("malformed response → VisualAIResponseParseError", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "I cannot analyze this image" }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test-key" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    await expect(ai.check(image, "test")).rejects.toThrow(VisualAIResponseParseError);
  });

  it("corrupt image → VisualAIImageError", async () => {
    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test-key" });
    const corruptImage = await readFile(join(FIXTURES_DIR, "corrupt.png"));
    await expect(ai.check(corruptImage, "test")).rejects.toThrow(VisualAIImageError);
  });
});

describe("integration: image auto-resize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("oversized image is resized before sending", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: PASSING_CHECK }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test-key" });
    const image = await readFile(join(FIXTURES_DIR, "oversized.png"));
    const result = await ai.check(image, "test");

    expect(result.pass).toBe(true);
    // Verify the provider was called (image was processed and sent)
    expect(mockAnthropicCreate).toHaveBeenCalledOnce();
  });
});
