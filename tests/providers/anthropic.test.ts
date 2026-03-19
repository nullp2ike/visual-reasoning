import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnthropicDriver } from "../../src/providers/anthropic.js";
import {
  VisualAIAuthError,
  VisualAIRateLimitError,
  VisualAIProviderError,
  VisualAITruncationError,
} from "../../src/errors.js";
import type { NormalizedImage } from "../../src/types.js";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    constructor(_opts: Record<string, unknown>) {}
    messages = { create: mockCreate };
  },
}));

function makeImage(): NormalizedImage {
  return {
    data: Buffer.from("fake"),
    mimeType: "image/png",
    base64: "ZmFrZQ==",
  };
}

describe("AnthropicDriver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends image and prompt, returns text and usage", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"pass": true, "reasoning": "ok"}' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const driver = new AnthropicDriver({
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      maxTokens: 4096,
    });
    const result = await driver.sendMessage([makeImage()], "Check this");

    expect(result.text).toBe('{"pass": true, "reasoning": "ok"}');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("model", "claude-sonnet-4-6");
  });

  it("formats image as base64 with media_type", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "{}" }],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const driver = new AnthropicDriver({
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      maxTokens: 4096,
    });
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    const messages = callArgs.messages as { content: Record<string, unknown>[] }[];
    const imageBlock = messages[0]!.content[0]!;
    expect(imageBlock).toEqual({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: "ZmFrZQ==",
      },
    });
  });

  it("sends multiple images", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "{}" }],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const driver = new AnthropicDriver({
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      maxTokens: 4096,
    });
    await driver.sendMessage([makeImage(), makeImage()], "compare");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    const messages = callArgs.messages as { content: Record<string, unknown>[] }[];
    // 2 images + 1 text block
    expect(messages[0]!.content).toHaveLength(3);
  });

  it("uses custom model", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "{}" }],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const driver = new AnthropicDriver({
      apiKey: "test-key",
      model: "claude-opus-4-6",
      maxTokens: 4096,
    });
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("model", "claude-opus-4-6");
  });

  it("maps 401 to VisualAIAuthError", async () => {
    const err = Object.assign(new Error("Unauthorized"), { status: 401 });
    mockCreate.mockRejectedValueOnce(err);

    const driver = new AnthropicDriver({
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      maxTokens: 4096,
    });
    await expect(driver.sendMessage([makeImage()], "test")).rejects.toThrow(VisualAIAuthError);
  });

  it("maps 429 to VisualAIRateLimitError", async () => {
    const err = Object.assign(new Error("Rate limited"), {
      status: 429,
      headers: { "retry-after": "30" },
    });
    mockCreate.mockRejectedValueOnce(err);

    const driver = new AnthropicDriver({
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      maxTokens: 4096,
    });
    await expect(driver.sendMessage([makeImage()], "test")).rejects.toThrow(VisualAIRateLimitError);
  });

  it("maps 500 to VisualAIProviderError", async () => {
    const err = Object.assign(new Error("Server error"), { status: 500 });
    mockCreate.mockRejectedValueOnce(err);

    const driver = new AnthropicDriver({
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      maxTokens: 4096,
    });
    await expect(driver.sendMessage([makeImage()], "test")).rejects.toThrow(VisualAIProviderError);
  });

  it("includes thinking and output_config when reasoningEffort is set", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "{}" }],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const driver = new AnthropicDriver({
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      maxTokens: 4096,
      reasoningEffort: "high",
    });
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("thinking", { type: "adaptive" });
    expect(callArgs).toHaveProperty("output_config", { effort: "high" });
  });

  it("maps xhigh reasoning effort to max for Anthropic", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "{}" }],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const driver = new AnthropicDriver({
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      maxTokens: 4096,
      reasoningEffort: "xhigh",
    });
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("thinking", { type: "adaptive" });
    expect(callArgs).toHaveProperty("output_config", { effort: "max" });
  });

  it("does not include thinking params when reasoningEffort is not set", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "{}" }],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const driver = new AnthropicDriver({
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      maxTokens: 4096,
    });
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty("thinking");
    expect(callArgs).not.toHaveProperty("output_config");
  });

  it("throws VisualAIAuthError when no API key", async () => {
    const originalEnv = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const driver = new AnthropicDriver({
      apiKey: undefined,
      model: "claude-sonnet-4-6",
      maxTokens: 4096,
    });
    await expect(driver.sendMessage([makeImage()], "test")).rejects.toThrow(VisualAIAuthError);

    process.env.ANTHROPIC_API_KEY = originalEnv;
  });

  it("throws VisualAITruncationError when stop_reason is max_tokens", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"pass": tr' }],
      usage: { input_tokens: 100, output_tokens: 4096 },
      stop_reason: "max_tokens",
    });

    const driver = new AnthropicDriver({
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      maxTokens: 4096,
    });

    const err = await driver.sendMessage([makeImage()], "test").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VisualAITruncationError);
    const truncErr = err as VisualAITruncationError;
    expect(truncErr.code).toBe("RESPONSE_TRUNCATED");
    expect(truncErr.partialResponse).toBe('{"pass": tr');
    expect(truncErr.maxTokens).toBe(4096);
  });

  it("does not throw on stop_reason end_turn", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"pass": true}' }],
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: "end_turn",
    });

    const driver = new AnthropicDriver({
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      maxTokens: 4096,
    });
    const result = await driver.sendMessage([makeImage()], "test");
    expect(result.text).toBe('{"pass": true}');
  });
});
