import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { visualAI } from "../../src/core/client.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures");

const mockAnthropicCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    constructor(_opts: Record<string, unknown>) {}
    messages = { create: mockAnthropicCreate };
  },
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_opts: Record<string, unknown>) {}
    responses = { create: vi.fn() };
  },
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class MockGoogleGenAI {
    constructor(_opts: Record<string, unknown>) {}
    models = { generateContent: vi.fn() };
  },
}));

function makePassingResponse(statementsCount: number) {
  return JSON.stringify({
    pass: true,
    reasoning: "All checks passed",
    issues: [],
    statements: Array.from({ length: statementsCount }, (_, i) => ({
      statement: `Statement ${i + 1}`,
      pass: true,
      reasoning: "Looks good",
    })),
  });
}

describe("visualAI template methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("elementsVisible() returns CheckResult", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: makePassingResponse(3) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    const result = await ai.elementsVisible(image, ["A", "B", "C"]);

    expect(result.pass).toBe(true);
    expect(result.statements).toHaveLength(3);
  });

  it("elementsHidden() returns CheckResult", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: makePassingResponse(2) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    const result = await ai.elementsHidden(image, ["Spinner", "Modal"]);

    expect(result.pass).toBe(true);
    expect(result.statements).toHaveLength(2);
  });

  it("elementsVisible() sends the finished-state rule by default", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: makePassingResponse(1) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    await ai.elementsVisible(image, ["Cover image"]);

    const sent = JSON.stringify(mockAnthropicCreate.mock.calls[0]?.[0]);
    expect(sent).toContain("finished, presented state");
  });

  it("elementsVisible() omits the finished-state rule when finalState is false", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: makePassingResponse(1) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    await ai.elementsVisible(image, ["Cover image"], { finalState: false });

    const sent = JSON.stringify(mockAnthropicCreate.mock.calls[0]?.[0]);
    expect(sent).not.toContain("finished, presented state");
    // Clipping guidance is independent of load state and must survive.
    expect(sent).toContain("layout fault");
  });

  it("elementsHidden() omits the state-overlay rule when finalState is false", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: makePassingResponse(1) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    await ai.elementsHidden(image, ["Cookie banner"], { finalState: false });

    const sent = JSON.stringify(mockAnthropicCreate.mock.calls[0]?.[0]);
    expect(sent).not.toContain("progress bar or error overlay");
    expect(sent).toContain("appears nowhere in this screenshot counts as hidden");
  });

  it("elementsVisible() forwards requireCorrectRendering to the provider", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: makePassingResponse(1) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    await ai.elementsVisible(image, ["Promo banner"], { requireCorrectRendering: true });

    const sent = JSON.stringify(mockAnthropicCreate.mock.calls[0]?.[0]);
    expect(sent).toContain("clearly defective in how it is rendered");
    expect(sent).toContain("correctly rendered");
  });

  it("elementsVisible() stays a presence check when the option is omitted", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: makePassingResponse(1) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    await ai.elementsVisible(image, ["Promo banner"]);

    const sent = JSON.stringify(mockAnthropicCreate.mock.calls[0]?.[0]);
    expect(sent).not.toContain("clearly defective in how it is rendered");
  });

  it("elementsVisible() throws on empty elements array", async () => {
    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    await expect(ai.elementsVisible(image, [])).rejects.toThrow("At least one element");
  });

  it("elementsHidden() throws on empty elements array", async () => {
    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    await expect(ai.elementsHidden(image, [])).rejects.toThrow("At least one element");
  });

  it("accessibility() returns CheckResult", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: makePassingResponse(3) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    const result = await ai.accessibility(image);

    expect(result.pass).toBe(true);
  });

  it("layout() returns CheckResult", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: makePassingResponse(3) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    const result = await ai.layout(image);

    expect(result.pass).toBe(true);
  });

  it("pageLoad() returns CheckResult", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: makePassingResponse(3) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    const result = await ai.pageLoad(image);

    expect(result.pass).toBe(true);
  });

  it("content() returns CheckResult", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: makePassingResponse(4) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    const result = await ai.content(image);

    expect(result.pass).toBe(true);
  });

  it("accessibility() with selective checks", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: makePassingResponse(1) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    const result = await ai.accessibility(image, { checks: ["contrast"] });

    expect(result.pass).toBe(true);
  });

  it("all template methods include durationSeconds in usage", async () => {
    const methods = [
      "elementsVisible",
      "elementsHidden",
      "accessibility",
      "layout",
      "pageLoad",
      "content",
    ] as const;

    for (const method of methods) {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: makePassingResponse(1) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
      const image = await readFile(join(FIXTURES_DIR, "small.png"));

      let result;
      if (method === "elementsVisible" || method === "elementsHidden") {
        result = await ai[method](image, ["element"]);
      } else {
        result = await ai[method](image);
      }

      expect(result.usage).toBeDefined();
      expect(result.usage!.durationSeconds).toBeTypeOf("number");
      expect(result.usage!.durationSeconds!).toBeGreaterThanOrEqual(0);
    }
  });

  it("content() with selective checks", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: makePassingResponse(1) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test" });
    const image = await readFile(join(FIXTURES_DIR, "small.png"));
    const result = await ai.content(image, { checks: ["error-messages"] });

    expect(result.pass).toBe(true);
  });
});
