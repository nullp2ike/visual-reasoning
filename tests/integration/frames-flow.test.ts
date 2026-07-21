import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { visualAI } from "../../src/core/client.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures");

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

async function png(): Promise<Buffer> {
  return readFile(join(FIXTURES_DIR, "small.png"));
}

describe("integration: pre-sampled frames → check()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends each frame as a timeline and returns timestamped statements", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            pass: true,
            reasoning: "Toast appeared in the second frame.",
            issues: [],
            statements: [
              {
                statement: 'A success toast with text "Saved" appears',
                pass: true,
                reasoning: "Visible in the 1.0s frame",
                confidence: "high",
                timestampSeconds: 1,
              },
            ],
          }),
        },
      ],
      usage: { input_tokens: 700, output_tokens: 90 },
    });

    const frame = await png();
    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test-key" });
    const result = await ai.check({ frames: [frame, frame] }, [
      'A success toast with text "Saved" appears',
    ]);

    expect(result.pass).toBe(true);
    expect(result.statements[0]?.timestampSeconds).toBe(1);
    expect(result.frames?.count).toBe(2);
    expect(result.frames?.timestampsSeconds).toEqual([0, 1]);
    expect(result.frames?.durationSeconds).toBe(1);

    const call = mockAnthropicCreate.mock.calls[0]![0];
    const messageContent = (call as { messages: Array<{ content: unknown[] }> }).messages[0]!
      .content;
    const imageBlocks = messageContent.filter(
      (b): b is { type: "image" } => (b as { type: string }).type === "image",
    );
    expect(imageBlocks).toHaveLength(2);

    const textBlock = messageContent.find(
      (b): b is { type: "text"; text: string } => (b as { type: string }).type === "text",
    );
    expect(textBlock?.text).toContain("Video timeline");
    expect(textBlock?.text).toContain("0: 0.00s");
    expect(textBlock?.text).toContain("1: 1.00s");
  });

  it("honors explicit per-frame timestamps and custom fps", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            pass: true,
            reasoning: "ok",
            issues: [],
            statements: [
              {
                statement: "test",
                pass: true,
                reasoning: "",
                confidence: "high",
                timestampSeconds: 5,
              },
            ],
          }),
        },
      ],
      usage: { input_tokens: 200, output_tokens: 40 },
    });

    const frame = await png();
    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test-key" });
    const result = await ai.check(
      { frames: [{ image: frame, timestampSeconds: 5 }, frame], fps: 4 },
      "test",
    );

    // Frame 0 explicit → 5s; frame 1 bare → index/fps = 1/4 = 0.25s.
    expect(result.frames?.timestampsSeconds).toEqual([5, 0.25]);
  });
});

describe("integration: pre-sampled frames → ask()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns frameReferences over the frame timeline", async () => {
    mockOpenAICreate.mockResolvedValueOnce({
      output_text: JSON.stringify({
        summary: "A toast appears in the last frame.",
        issues: [],
        frameReferences: [1],
      }),
      usage: { input_tokens: 500, output_tokens: 60 },
    });

    const frame = await png();
    const ai = visualAI({ model: "gpt-5-mini", apiKey: "test-key" });
    const result = await ai.ask({ frames: [frame, frame] }, "What appears?");

    expect(result.summary).toContain("toast");
    expect(result.frameReferences).toEqual([1]);
    expect(result.frames?.count).toBe(2);
  });
});
