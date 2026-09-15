import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { visualAI } from "../../src/core/client.js";
import { VisualAIConfigError, VisualAIVideoError } from "../../src/errors.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures");
const SMALL_MP4 = join(FIXTURES_DIR, "small.mp4");

const mockGenerateContent = vi.fn();
const mockAnthropicCreate = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class MockGoogleGenAI {
    constructor(_opts: Record<string, unknown>) {}
    models = { generateContent: mockGenerateContent };
    files = { upload: vi.fn(), get: vi.fn(), delete: vi.fn() };
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    constructor(_opts: Record<string, unknown>) {}
    messages = { create: mockAnthropicCreate };
  },
}));

interface GeminiCall {
  contents: unknown[];
  config: Record<string, unknown>;
}

function lastGeminiCall(): GeminiCall {
  return mockGenerateContent.mock.calls.at(-1)![0] as GeminiCall;
}

function checkResponse(timestampSeconds: number | null) {
  return {
    text: JSON.stringify({
      pass: true,
      reasoning: "Toast visible.",
      issues: [],
      statements: [
        {
          statement: 'A success toast with text "Saved" briefly appears',
          pass: true,
          reasoning: "Visible around 1.2s",
          confidence: "high",
          timestampSeconds,
        },
      ],
    }),
    usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 80, thoughtsTokenCount: 40 },
  };
}

describe("integration: native video → Google models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the video bytes to Gemini by default and reports video metadata", async () => {
    mockGenerateContent.mockResolvedValueOnce(checkResponse(1.2));

    const ai = visualAI({ model: "gemini-3-flash-preview", apiKey: "test-key" });
    const result = await ai.check(SMALL_MP4, ['A success toast with text "Saved" briefly appears']);

    expect(result.pass).toBe(true);
    expect(result.statements[0]?.timestampSeconds).toBe(1.2);
    expect(result.frames).toBeUndefined();
    expect(result.video).toBeDefined();
    expect(result.video?.fps).toBe(1);
    expect(result.video?.mimeType).toBe("video/mp4");
    expect(result.video?.delivery).toBe("inline");
    expect(result.video?.durationSeconds).toBeGreaterThan(1.5);
    expect(result.video?.durationSeconds).toBeLessThan(2.5);
    expect(result.usage).toMatchObject({ inputTokens: 300, outputTokens: 120 });

    const { contents } = lastGeminiCall();
    expect(contents).toHaveLength(2);
    const bytes = await readFile(SMALL_MP4);
    expect(contents[0]).toEqual({
      inlineData: { data: bytes.toString("base64"), mimeType: "video/mp4" },
      videoMetadata: { fps: 1 },
    });
    const prompt = contents[1] as string;
    expect(prompt).toContain("Evaluate the provided video recording");
    expect(prompt).toContain("Video recording:\n- Total duration:");
    expect(prompt).toContain("ANY moment of the video");
    expect(prompt).not.toContain("Video timeline");
  });

  it("forwards fps as the provider's sampling rate", async () => {
    mockGenerateContent.mockResolvedValueOnce(checkResponse(null));
    const ai = visualAI({ model: "gemini-3-flash-preview", apiKey: "test-key" });
    const result = await ai.check(SMALL_MP4, "test", { video: { fps: 2 } });
    expect(result.video?.fps).toBe(2);
    expect((lastGeminiCall().contents[0] as { videoMetadata: unknown }).videoMetadata).toEqual({
      fps: 2,
    });
  });

  it("returns timestampReferences from ask() instead of frameReferences", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: "The toast shows at 1.2s.",
        issues: [],
        timestampReferences: [1.2],
      }),
      usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 30 },
    });

    const ai = visualAI({ model: "gemini-3-flash-preview", apiKey: "test-key" });
    const result = await ai.ask(SMALL_MP4, "What appears?");

    expect(result.timestampReferences).toEqual([1.2]);
    expect(result.frameReferences).toBeUndefined();
    expect(result.frames).toBeUndefined();
    expect(result.video?.delivery).toBe("inline");
    const prompt = lastGeminiCall().contents[1] as string;
    expect(prompt).toContain('"timestampReferences"');
    expect(prompt).not.toContain("frameReferences");
  });

  it("samples frames instead when video.mode is frames", async () => {
    mockGenerateContent.mockResolvedValueOnce(checkResponse(0.5));
    const ai = visualAI({ model: "gemini-3-flash-preview", apiKey: "test-key" });
    const result = await ai.check(SMALL_MP4, "test", { video: { mode: "frames" } });

    expect(result.video).toBeUndefined();
    expect(result.frames).toMatchObject({ count: 2, timestampsSeconds: [0.5, 1.5] });
    const { contents } = lastGeminiCall();
    const imageParts = contents.filter(
      (p) => (p as { inlineData?: { mimeType: string } }).inlineData?.mimeType === "image/jpeg",
    );
    expect(imageParts).toHaveLength(2);
    expect(contents.at(-1) as string).toContain("Video timeline");
  });

  it("always sends pre-sampled frames as frames", async () => {
    mockGenerateContent.mockResolvedValueOnce(checkResponse(0));
    const png = await readFile(join(FIXTURES_DIR, "small.png"));
    const ai = visualAI({ model: "gemini-3-flash-preview", apiKey: "test-key" });
    const result = await ai.check({ frames: [png] }, "test", { video: { mode: "native" } });

    expect(result.video).toBeUndefined();
    expect(result.frames?.count).toBe(1);
    expect(
      (lastGeminiCall().contents[0] as { inlineData: { mimeType: string } }).inlineData.mimeType,
    ).toBe("image/png");
  });

  it("enforces maxDurationSeconds before calling the provider", async () => {
    const ai = visualAI({ model: "gemini-3-flash-preview", apiKey: "test-key" });
    await expect(ai.check(SMALL_MP4, "test", { video: { maxDurationSeconds: 1 } })).rejects.toThrow(
      VisualAIVideoError,
    );
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("rejects an unknown video mode", async () => {
    const ai = visualAI({ model: "gemini-3-flash-preview", apiKey: "test-key" });
    await expect(
      ai.check(SMALL_MP4, "test", {
        video: { mode: "stream" as unknown as "auto" },
      }),
    ).rejects.toThrow(/Invalid video mode/);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});

describe("integration: native video on providers without support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws VisualAIConfigError for mode native on an Anthropic model, before touching ffmpeg", async () => {
    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test-key" });
    await expect(ai.check(SMALL_MP4, "test", { video: { mode: "native" } })).rejects.toThrow(
      VisualAIConfigError,
    );
    await expect(ai.check(SMALL_MP4, "test", { video: { mode: "native" } })).rejects.toThrow(
      /Native video delivery is not supported by the "anthropic" provider/,
    );
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it("falls back to frame sampling under the default auto mode", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: checkResponse(0.5).text }],
      usage: { input_tokens: 500, output_tokens: 60 },
    });
    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test-key" });
    const result = await ai.check(SMALL_MP4, "test");
    expect(result.frames?.count).toBe(2);
    expect(result.video).toBeUndefined();
  });

  it("ignores mode native for an image input on an Anthropic model", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: checkResponse(null).text }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const png = await readFile(join(FIXTURES_DIR, "small.png"));
    const ai = visualAI({ model: "claude-sonnet-4-6", apiKey: "test-key" });
    const result = await ai.check(png, "test", { video: { mode: "native" } });
    expect(result.pass).toBe(true);
    expect(result.video).toBeUndefined();
    expect(result.frames).toBeUndefined();
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
  });
});
