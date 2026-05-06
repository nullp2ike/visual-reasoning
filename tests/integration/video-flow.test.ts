import { beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { visualAI } from "../../src/core/client.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures");
const SMALL_MP4 = join(FIXTURES_DIR, "small.mp4");

const mockAnthropicCreate = vi.fn();
const mockOpenAICreate = vi.fn();

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

describe("integration: video → check()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("samples frames, sends them to the provider, and returns timestamped statements", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            pass: true,
            reasoning: "Toast appeared briefly around 0.5s.",
            issues: [],
            statements: [
              {
                statement: 'A success toast with text "Saved" briefly appears',
                pass: true,
                reasoning: "Visible in the first sampled frame",
                confidence: "high",
                timestampSeconds: 0.5,
              },
            ],
          }),
        },
      ],
      usage: { input_tokens: 800, output_tokens: 120 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test-key" });
    const result = await ai.check(SMALL_MP4, ['A success toast with text "Saved" briefly appears']);

    expect(result.pass).toBe(true);
    expect(result.statements[0]?.timestampSeconds).toBe(0.5);
    expect(result.frames).toBeDefined();
    expect(result.frames?.count).toBe(2);
    expect(result.frames?.durationSeconds).toBeGreaterThan(1.5);
    expect(result.frames?.durationSeconds).toBeLessThan(2.5);
    expect(result.frames?.timestampsSeconds).toEqual([0.5, 1.5]);

    const call = mockAnthropicCreate.mock.calls[0]![0];
    const messageContent = (call as { messages: Array<{ content: unknown[] }> }).messages[0]!
      .content;
    const imageBlocks = messageContent.filter(
      (b): b is { type: "image" } => (b as { type: string }).type === "image",
    );
    expect(imageBlocks.length).toBe(2);

    const textBlock = messageContent.find(
      (b): b is { type: "text"; text: string } => (b as { type: string }).type === "text",
    );
    expect(textBlock?.text).toContain("Video timeline");
    expect(textBlock?.text).toContain("0: 0.50s");
  });

  it("respects a video sampling override", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            pass: true,
            reasoning: "Single frame check.",
            issues: [],
            statements: [
              {
                statement: "test",
                pass: true,
                reasoning: "",
                confidence: "high",
                timestampSeconds: 0.5,
              },
            ],
          }),
        },
      ],
      usage: { input_tokens: 200, output_tokens: 50 },
    });

    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test-key" });
    const result = await ai.check(SMALL_MP4, "test", { video: { fps: 1, maxFrames: 1 } });

    expect(result.frames?.count).toBe(1);
    const call = mockAnthropicCreate.mock.calls[0]![0];
    const imageBlocks = (
      call as { messages: Array<{ content: unknown[] }> }
    ).messages[0]!.content.filter(
      (b): b is { type: "image" } => (b as { type: string }).type === "image",
    );
    expect(imageBlocks).toHaveLength(1);
  });

  it("rejects a video that exceeds the default duration cap", async () => {
    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test-key" });
    await expect(ai.check(join(FIXTURES_DIR, "oversized.mp4"), "test")).rejects.toThrow(
      /exceeds limit of 10s/,
    );
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });
});

describe("integration: video → ask()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns frameReferences when the model emits them", async () => {
    mockOpenAICreate.mockResolvedValueOnce({
      output_text: JSON.stringify({
        summary: "A success toast appears mid-clip.",
        issues: [],
        frameReferences: [0, 1],
      }),
      usage: { input_tokens: 800, output_tokens: 100 },
    });

    const ai = visualAI({ model: "gpt-5-mini", apiKey: "test-key" });
    const result = await ai.ask(SMALL_MP4, "What toasts appear?");

    expect(result.summary).toContain("toast");
    expect(result.frameReferences).toEqual([0, 1]);
    expect(result.frames?.count).toBe(2);
  });
});
