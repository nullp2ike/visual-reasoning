import { describe, it, expect, vi, beforeEach } from "vitest";
import { GoogleDriver } from "../../src/providers/google.js";
import {
  VisualAIAuthError,
  VisualAIProviderError,
  VisualAIRateLimitError,
  VisualAITruncationError,
} from "../../src/errors.js";
import type { NormalizedImage } from "../../src/types.js";

const mockGenerateContent = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class MockGoogleGenAI {
    constructor(_opts: Record<string, unknown>) {}
    models = { generateContent: mockGenerateContent };
  },
}));

function makeImage(): NormalizedImage {
  return {
    data: Buffer.from("fake"),
    mimeType: "image/png",
    base64: "ZmFrZQ==",
  };
}

function makeDriver(
  overrides: Partial<ConstructorParameters<typeof GoogleDriver>[0]> = {},
): GoogleDriver {
  return new GoogleDriver({
    apiKey: "test-key",
    model: "gemini-3-flash-preview",
    maxTokens: 4096,
    ...overrides,
  });
}

describe("GoogleDriver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends image and prompt, returns text and usage", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: '{"pass": true}',
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
    });

    const driver = makeDriver();
    const result = await driver.sendMessage([makeImage()], "Check this");

    expect(result.text).toBe('{"pass": true}');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it("formats image as inlineData", async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: "{}" });

    const driver = makeDriver();
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockGenerateContent.mock.calls[0]![0] as Record<string, unknown>;
    const contents = callArgs.contents as unknown[];
    expect(contents[0]).toEqual({
      inlineData: { data: "ZmFrZQ==", mimeType: "image/png" },
    });
  });

  it("sets mediaResolution for high fidelity and omits it for auto/default", async () => {
    mockGenerateContent.mockResolvedValue({ text: "{}" });

    await makeDriver({ imageDetail: "high" }).sendMessage([makeImage()], "test");
    let config = (mockGenerateContent.mock.calls.at(-1)![0] as { config: Record<string, unknown> })
      .config;
    expect(config.mediaResolution).toBe("MEDIA_RESOLUTION_HIGH");

    for (const imageDetail of [undefined, "auto" as const]) {
      await makeDriver({ imageDetail }).sendMessage([makeImage()], "test");
      config = (mockGenerateContent.mock.calls.at(-1)![0] as { config: Record<string, unknown> })
        .config;
      expect(config).not.toHaveProperty("mediaResolution");
    }
  });

  it("requests JSON response format", async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: "{}" });

    const driver = makeDriver();
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockGenerateContent.mock.calls[0]![0] as Record<string, unknown>;
    const config = callArgs.config as Record<string, unknown>;
    expect(config.responseMimeType).toBe("application/json");
  });

  it("uses configured model", async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: "{}" });

    const driver = makeDriver();
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockGenerateContent.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("model", "gemini-3-flash-preview");
  });

  it("includes thinkingConfig when reasoningEffort is set", async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: "{}" });

    const driver = makeDriver({ reasoningEffort: "medium" });
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockGenerateContent.mock.calls[0]![0] as Record<string, unknown>;
    const config = callArgs.config as Record<string, unknown>;
    expect(config).toHaveProperty("thinkingConfig", { thinkingLevel: "medium" });
  });

  it("maps reasoning effort levels 1:1 to Google thinking levels (xhigh clamps to high)", async () => {
    const expectedLevels: Record<string, string> = {
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "high",
    };

    for (const [level, thinkingLevel] of Object.entries(expectedLevels)) {
      mockGenerateContent.mockResolvedValueOnce({ text: "{}" });

      const driver = makeDriver({
        reasoningEffort: level as "low" | "medium" | "high" | "xhigh",
      });
      await driver.sendMessage([makeImage()], "test");

      const callArgs = mockGenerateContent.mock.calls.at(-1)![0] as Record<string, unknown>;
      const config = callArgs.config as Record<string, unknown>;
      expect(config).toHaveProperty("thinkingConfig", { thinkingLevel });
    }
  });

  it("does not include thinkingConfig when reasoningEffort is not set", async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: "{}" });

    const driver = makeDriver();
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockGenerateContent.mock.calls[0]![0] as Record<string, unknown>;
    const config = callArgs.config as Record<string, unknown>;
    expect(config).not.toHaveProperty("thinkingConfig");
  });

  it("maps 401 to VisualAIAuthError", async () => {
    const err = Object.assign(new Error("Unauthorized"), { status: 401 });
    mockGenerateContent.mockRejectedValueOnce(err);

    const driver = makeDriver();
    await expect(driver.sendMessage([makeImage()], "test")).rejects.toThrow(VisualAIAuthError);
  });

  it("maps 429 to VisualAIRateLimitError", async () => {
    const err = Object.assign(new Error("Rate limited"), { status: 429 });
    mockGenerateContent.mockRejectedValueOnce(err);

    const driver = makeDriver();
    await expect(driver.sendMessage([makeImage()], "test")).rejects.toThrow(VisualAIRateLimitError);
  });

  it("maps 500 to VisualAIProviderError", async () => {
    const err = Object.assign(new Error("Server error"), { status: 500 });
    mockGenerateContent.mockRejectedValueOnce(err);

    const driver = makeDriver();
    await expect(driver.sendMessage([makeImage()], "test")).rejects.toThrow(VisualAIProviderError);
  });

  it("handles missing usage metadata", async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: "{}" });

    const driver = makeDriver();
    const result = await driver.sendMessage([makeImage()], "test");
    expect(result.usage).toBeUndefined();
  });

  it("throws VisualAITruncationError when finishReason is MAX_TOKENS", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: '{"pass": tr',
      candidates: [{ finishReason: "MAX_TOKENS" }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 4096 },
    });

    const driver = makeDriver();
    const err = await driver.sendMessage([makeImage()], "test").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VisualAITruncationError);
    const truncErr = err as VisualAITruncationError;
    expect(truncErr.code).toBe("RESPONSE_TRUNCATED");
    expect(truncErr.partialResponse).toBe('{"pass": tr');
    expect(truncErr.maxTokens).toBe(4096);
  });

  it("throws VisualAIProviderError when finishReason is SAFETY", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: "",
      candidates: [{ finishReason: "SAFETY" }],
    });

    const driver = makeDriver();
    await expect(driver.sendMessage([makeImage()], "test")).rejects.toThrow(VisualAIProviderError);
  });

  it("throws VisualAIProviderError when finishReason is RECITATION", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: "",
      candidates: [{ finishReason: "RECITATION" }],
    });

    const driver = makeDriver();
    await expect(driver.sendMessage([makeImage()], "test")).rejects.toThrow(VisualAIProviderError);
  });

  it("does not throw on finishReason STOP", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: '{"pass": true}',
      candidates: [{ finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
    });

    const driver = makeDriver();
    const result = await driver.sendMessage([makeImage()], "test");
    expect(result.text).toBe('{"pass": true}');
  });

  it("folds thinking tokens into outputTokens and reports them as reasoningTokens", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: "{}",
      candidates: [{ finishReason: "STOP" }],
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 200,
        thoughtsTokenCount: 150,
      },
    });

    const driver = makeDriver();
    const result = await driver.sendMessage([makeImage()], "test");
    // Gemini bills thinking at the output rate, so outputTokens = visible (200) +
    // thinking (150); reasoningTokens carries the breakdown. This keeps
    // calculateCost correct and matches OpenAI/OpenRouter semantics.
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 350,
      reasoningTokens: 150,
    });
  });

  it("omits reasoning tokens when not present in usage", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: "{}",
      candidates: [{ finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
    });

    const driver = makeDriver();
    const result = await driver.sendMessage([makeImage()], "test");
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    expect(result.usage).not.toHaveProperty("reasoningTokens");
  });

  describe("generateImage", () => {
    it("calls generateContent with responseModalities and returns image data", async () => {
      const fakeBase64 = Buffer.from("fake-png-data").toString("base64");
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: fakeBase64, mimeType: "image/png" } }],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 100 },
      });

      const driver = makeDriver();
      const result = await driver.generateImage([makeImage()], "Generate diff");

      expect(result.imageData).toEqual(Buffer.from("fake-png-data"));
      expect(result.mimeType).toBe("image/png");
      expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 100 });

      const callArgs = mockGenerateContent.mock.calls[0]![0] as Record<string, unknown>;
      const config = callArgs.config as Record<string, unknown>;
      expect(config.responseModalities).toEqual(["TEXT", "IMAGE"]);
    });

    it("uses default image generation model", async () => {
      const fakeBase64 = Buffer.from("img").toString("base64");
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          { content: { parts: [{ inlineData: { data: fakeBase64, mimeType: "image/png" } }] } },
        ],
      });

      const driver = makeDriver();
      await driver.generateImage([makeImage()], "test");

      const callArgs = mockGenerateContent.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs.model).toBe("gemini-2.5-flash-image");
    });

    it("uses custom model when provided", async () => {
      const fakeBase64 = Buffer.from("img").toString("base64");
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          { content: { parts: [{ inlineData: { data: fakeBase64, mimeType: "image/png" } }] } },
        ],
      });

      const driver = makeDriver();
      await driver.generateImage([makeImage()], "test", {
        model: "gemini-3.1-flash-image-preview",
      });

      const callArgs = mockGenerateContent.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs.model).toBe("gemini-3.1-flash-image-preview");
    });

    it("throws VisualAIProviderError when response has no parts", async () => {
      mockGenerateContent.mockResolvedValueOnce({ candidates: [{ content: {} }] });

      const driver = makeDriver();
      await expect(driver.generateImage([makeImage()], "test")).rejects.toThrow(
        VisualAIProviderError,
      );
      mockGenerateContent.mockResolvedValueOnce({ candidates: [{ content: {} }] });
      await expect(driver.generateImage([makeImage()], "test")).rejects.toThrow(
        /no response parts/,
      );
    });

    it("throws VisualAIProviderError when response has no image data", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [{ content: { parts: [{ text: "No image here" }] } }],
      });

      const driver = makeDriver();
      await expect(driver.generateImage([makeImage()], "test")).rejects.toThrow(
        VisualAIProviderError,
      );
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [{ content: { parts: [{ text: "No image here" }] } }],
      });
      await expect(driver.generateImage([makeImage()], "test")).rejects.toThrow(/no image data/);
    });

    it("maps API errors through error mapper", async () => {
      const err = Object.assign(new Error("Unauthorized"), { status: 401 });
      mockGenerateContent.mockRejectedValueOnce(err);

      const driver = makeDriver();
      await expect(driver.generateImage([makeImage()], "test")).rejects.toThrow(VisualAIAuthError);
    });

    it("uses code execution config for Gemini 3 models when generating diffs", async () => {
      const fakeBase64 = Buffer.from("img").toString("base64");
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          { content: { parts: [{ inlineData: { data: fakeBase64, mimeType: "image/png" } }] } },
        ],
      });

      const driver = makeDriver();
      await driver.generateImage([makeImage()], "test prompt", {
        model: "gemini-3-flash-preview",
        promptKind: "ai-diff",
      });

      const callArgs = mockGenerateContent.mock.calls[0]![0] as Record<string, unknown>;
      const config = callArgs.config as Record<string, unknown>;
      const contents = callArgs.contents as unknown[];
      const prompt = contents[contents.length - 1] as string;
      expect(config).toHaveProperty("tools", [{ codeExecution: {} }]);
      expect(config).not.toHaveProperty("responseModalities");
      expect(prompt).toContain("Python");
      expect(prompt).toContain("matplotlib");
    });

    it("uses code execution config for Gemini 3.1 models when generating diffs", async () => {
      const fakeBase64 = Buffer.from("img").toString("base64");
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          { content: { parts: [{ inlineData: { data: fakeBase64, mimeType: "image/png" } }] } },
        ],
      });

      const driver = makeDriver();
      await driver.generateImage([makeImage()], "test prompt", {
        model: "gemini-3.1-pro-preview",
        promptKind: "ai-diff",
      });

      const callArgs = mockGenerateContent.mock.calls[0]![0] as Record<string, unknown>;
      const config = callArgs.config as Record<string, unknown>;
      expect(config).toHaveProperty("tools", [{ codeExecution: {} }]);
    });

    it("uses responseModalities config for default Gemini 2.x model", async () => {
      const fakeBase64 = Buffer.from("img").toString("base64");
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          { content: { parts: [{ inlineData: { data: fakeBase64, mimeType: "image/png" } }] } },
        ],
      });

      const driver = makeDriver();
      await driver.generateImage([makeImage()], "test prompt");

      const callArgs = mockGenerateContent.mock.calls[0]![0] as Record<string, unknown>;
      const config = callArgs.config as Record<string, unknown>;
      expect(config).toHaveProperty("responseModalities", ["TEXT", "IMAGE"]);
      expect(config).not.toHaveProperty("tools");
    });

    it("passes caller prompt through unchanged outside ai-diff mode", async () => {
      const fakeBase64 = Buffer.from("img").toString("base64");
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          { content: { parts: [{ inlineData: { data: fakeBase64, mimeType: "image/png" } }] } },
        ],
      });

      const driver = makeDriver();
      await driver.generateImage([makeImage()], "my custom prompt", {
        model: "gemini-3-flash-preview",
      });

      const callArgs = mockGenerateContent.mock.calls[0]![0] as Record<string, unknown>;
      const contents = callArgs.contents as unknown[];
      const promptPart = contents[contents.length - 1] as string;
      expect(promptPart).toBe("my custom prompt");
    });

    it("throws when code execution returns no image", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [
                { executableCode: { code: "import matplotlib..." } },
                { codeExecutionResult: { outcome: "ERROR", output: "ModuleNotFoundError" } },
              ],
            },
          },
        ],
      });

      const driver = makeDriver();
      await expect(
        driver.generateImage([makeImage()], "test", {
          model: "gemini-3-flash-preview",
          promptKind: "ai-diff",
        }),
      ).rejects.toThrow(/no image data/);
    });

    it("extracts image from code execution response with mixed part types", async () => {
      const fakeBase64 = Buffer.from("fake-png").toString("base64");
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [
                { executableCode: { code: "import matplotlib..." } },
                { codeExecutionResult: { outcome: "OK" } },
                { inlineData: { data: fakeBase64, mimeType: "image/png" } },
              ],
            },
          },
        ],
      });

      const driver = makeDriver();
      const result = await driver.generateImage([makeImage()], "test", {
        model: "gemini-3-flash-preview",
        promptKind: "ai-diff",
      });
      expect(result.imageData).toEqual(Buffer.from("fake-png"));
      expect(result.mimeType).toBe("image/png");
    });
  });
});
