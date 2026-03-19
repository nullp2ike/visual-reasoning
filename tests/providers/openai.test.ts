import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAIDriver } from "../../src/providers/openai.js";
import {
  VisualAIAuthError,
  VisualAIRateLimitError,
  VisualAIProviderError,
  VisualAITruncationError,
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

function makeResponse(text = "{}", overrides: Record<string, unknown> = {}) {
  return {
    output_text: text,
    usage: { input_tokens: 100, output_tokens: 50 },
    status: "completed",
    ...overrides,
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
    expect(callArgs).toHaveProperty("text", {
      format: { type: "json_object" },
    });
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
    mockCreate.mockResolvedValueOnce({ output_text: "{}", status: "completed" });

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
    });
    const result = await driver.sendMessage([makeImage()], "test");
    expect(result.usage).toBeUndefined();
  });

  it("throws VisualAITruncationError when status is incomplete", async () => {
    mockCreate.mockResolvedValueOnce({
      output_text: '{"pass": tr',
      usage: { input_tokens: 100, output_tokens: 4096 },
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    });

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
    });

    const err = await driver.sendMessage([makeImage()], "test").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VisualAITruncationError);
    const truncErr = err as VisualAITruncationError;
    expect(truncErr.code).toBe("RESPONSE_TRUNCATED");
    expect(truncErr.partialResponse).toBe('{"pass": tr');
    expect(truncErr.maxTokens).toBe(4096);
    expect(truncErr.message).toContain("max_output_tokens");
  });

  it("extracts reasoning tokens from usage", async () => {
    mockCreate.mockResolvedValueOnce({
      output_text: "{}",
      usage: {
        input_tokens: 100,
        output_tokens: 500,
        output_tokens_details: { reasoning_tokens: 350 },
      },
      status: "completed",
    });

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
    });
    const result = await driver.sendMessage([makeImage()], "test");
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 500,
      reasoningTokens: 350,
    });
  });

  it("omits reasoning tokens when not present", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
    });
    const result = await driver.sendMessage([makeImage()], "test");
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    expect(result.usage).not.toHaveProperty("reasoningTokens");
  });

  it("uses json_schema format when responseSchema is provided", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
    });
    const schema = { type: "object", properties: { pass: { type: "boolean" } } };
    await driver.sendMessage([makeImage()], "test", { responseSchema: schema });

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("text", {
      format: {
        type: "json_schema",
        name: "visual_ai_response",
        strict: true,
        schema,
      },
    });
  });

  it("falls back to json_object when no responseSchema is provided", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    const driver = new OpenAIDriver({
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: 4096,
    });
    await driver.sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("text", {
      format: { type: "json_object" },
    });
  });
});
