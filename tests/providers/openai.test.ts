import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAIDriver } from "../../src/providers/openai.js";
import {
  VisualAIAuthError,
  VisualAIRateLimitError,
  VisualAIProviderError,
} from "../../src/errors.js";
import type { NormalizedImage } from "../../src/types.js";

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_opts: Record<string, unknown>) {}
    responses = { create: mockCreate };
  },
}));

function makeImage(): NormalizedImage {
  return {
    data: Buffer.from("fake"),
    mimeType: "image/png",
    base64: "ZmFrZQ==",
  };
}

function makeResponse(text = "{}") {
  return {
    output_text: text,
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

describe("OpenAIDriver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends image and prompt, returns text and usage", async () => {
    mockCreate.mockResolvedValueOnce({
      output_text: '{"pass": true}',
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
    });
    const result = await driver.sendMessage([makeImage()], "Check this");

    expect(result.text).toBe('{"pass": true}');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it("formats image as input_image with flat image_url", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
    });
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    const input = callArgs.input as { content: Record<string, unknown>[] }[];
    const imageBlock = input[0]!.content[0] as { type: string; image_url: string };
    expect(imageBlock.type).toBe("input_image");
    expect(imageBlock.image_url).toBe("data:image/png;base64,ZmFrZQ==");
  });

  it("uses json_object text format", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
    });
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("text", { format: { type: "json_object" } });
  });

  it("uses max_output_tokens", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 2048,
    });
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("max_output_tokens", 2048);
  });

  it("uses default model gpt-5-mini", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
    });
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("model", "gpt-5-mini");
  });

  it("includes reasoning when reasoningEffort is set", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
      reasoningEffort: "low",
    });
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("reasoning", { effort: "low" });
  });

  it("passes xhigh reasoning effort", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
      reasoningEffort: "xhigh",
    });
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("reasoning", { effort: "xhigh" });
  });

  it("does not include reasoning when reasoningEffort is not set", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
    });
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty("reasoning");
  });

  it("maps 401 to VisualAIAuthError", async () => {
    const err = Object.assign(new Error("Unauthorized"), { status: 401 });
    mockCreate.mockRejectedValueOnce(err);

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
    });
    await expect(driver.sendMessage([makeImage()], "test")).rejects.toThrow(VisualAIAuthError);
  });

  it("maps 429 to VisualAIRateLimitError", async () => {
    const err = Object.assign(new Error("Rate limited"), { status: 429 });
    mockCreate.mockRejectedValueOnce(err);

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
    });
    await expect(driver.sendMessage([makeImage()], "test")).rejects.toThrow(VisualAIRateLimitError);
  });

  it("maps 500 to VisualAIProviderError", async () => {
    const err = Object.assign(new Error("Server error"), { status: 500 });
    mockCreate.mockRejectedValueOnce(err);

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
    });
    await expect(driver.sendMessage([makeImage()], "test")).rejects.toThrow(VisualAIProviderError);
  });

  it("handles missing usage in response", async () => {
    mockCreate.mockResolvedValueOnce({ output_text: "{}" });

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
    });
    const result = await driver.sendMessage([makeImage()], "test");
    expect(result.usage).toBeUndefined();
  });
});
