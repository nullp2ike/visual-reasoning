import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenRouterDriver } from "../../src/providers/openrouter.js";
import {
  VisualAIAuthError,
  VisualAIRateLimitError,
  VisualAIProviderError,
  VisualAITruncationError,
} from "../../src/errors.js";
import type { NormalizedImage } from "../../src/types.js";

const mockCreate = vi.fn();
const mockConstructor = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(opts: Record<string, unknown>) {
      mockConstructor(opts);
    }
    chat = { completions: { create: mockCreate } };
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
    choices: [{ message: { content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
    ...overrides,
  };
}

function makeDriver(overrides: Record<string, unknown> = {}) {
  return new OpenRouterDriver({
    apiKey: "test-key",
    model: "qwen/qwen3.6-flash",
    maxTokens: 4096,
    ...overrides,
  });
}

describe("OpenRouterDriver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends image and prompt, returns text and usage", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse('{"pass": true}'));

    const result = await makeDriver().sendMessage([makeImage()], "Check this");

    expect(result.text).toBe('{"pass": true}');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it("points the SDK at the OpenRouter base URL", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    await makeDriver().sendMessage([makeImage()], "test");

    const opts = mockConstructor.mock.calls[0]![0] as Record<string, unknown>;
    expect(opts.baseURL).toBe("https://openrouter.ai/api/v1");
    expect(opts.apiKey).toBe("test-key");
  });

  it("formats images as chat-completions image_url parts", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    await makeDriver().sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    const messages = callArgs.messages as { role: string; content: Record<string, unknown>[] }[];
    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe("user");
    const [imagePart, textPart] = messages[0]!.content;
    expect(imagePart).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,ZmFrZQ==" },
    });
    expect(textPart).toEqual({ type: "text", text: "test" });
  });

  it("uses max_tokens and model", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    await makeDriver({ maxTokens: 2048 }).sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("max_tokens", 2048);
    expect(callArgs).toHaveProperty("model", "qwen/qwen3.6-flash");
  });

  it("requests json_object response format by default", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    await makeDriver().sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("response_format", { type: "json_object" });
  });

  it("uses json_schema response format when responseSchema is provided", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    const schema = { type: "object", properties: { pass: { type: "boolean" } } };
    await makeDriver().sendMessage([makeImage()], "test", { responseSchema: schema });

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("response_format", {
      type: "json_schema",
      json_schema: { name: "visual_ai_response", strict: true, schema },
    });
  });

  it("includes reasoning when reasoningEffort is set", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    await makeDriver({ reasoningEffort: "low" }).sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("reasoning", { effort: "low" });
  });

  it("maps xhigh reasoning effort to high", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    await makeDriver({ reasoningEffort: "xhigh" }).sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty("reasoning", { effort: "high" });
  });

  it("does not include reasoning when reasoningEffort is not set", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    await makeDriver().sendMessage([makeImage()], "test");

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty("reasoning");
  });

  it("throws VisualAITruncationError when finish_reason is length", async () => {
    mockCreate.mockResolvedValueOnce(
      makeResponse('{"pass": tr', {
        choices: [{ message: { content: '{"pass": tr' }, finish_reason: "length" }],
      }),
    );

    const err = await makeDriver()
      .sendMessage([makeImage()], "test")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VisualAITruncationError);
    const truncErr = err as VisualAITruncationError;
    expect(truncErr.code).toBe("RESPONSE_TRUNCATED");
    expect(truncErr.partialResponse).toBe('{"pass": tr');
    expect(truncErr.maxTokens).toBe(4096);
  });

  it("throws VisualAIProviderError when choices are empty", async () => {
    mockCreate.mockResolvedValueOnce({ choices: [] });

    await expect(makeDriver().sendMessage([makeImage()], "test")).rejects.toThrow(
      VisualAIProviderError,
    );
  });

  it("maps 401 to VisualAIAuthError", async () => {
    mockCreate.mockRejectedValueOnce(Object.assign(new Error("Unauthorized"), { status: 401 }));

    await expect(makeDriver().sendMessage([makeImage()], "test")).rejects.toThrow(
      VisualAIAuthError,
    );
  });

  it("maps 429 to VisualAIRateLimitError", async () => {
    mockCreate.mockRejectedValueOnce(Object.assign(new Error("Rate limited"), { status: 429 }));

    await expect(makeDriver().sendMessage([makeImage()], "test")).rejects.toThrow(
      VisualAIRateLimitError,
    );
  });

  it("maps 500 to VisualAIProviderError", async () => {
    mockCreate.mockRejectedValueOnce(Object.assign(new Error("Server error"), { status: 500 }));

    await expect(makeDriver().sendMessage([makeImage()], "test")).rejects.toThrow(
      VisualAIProviderError,
    );
  });

  it("handles missing usage in response", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
    });

    const result = await makeDriver().sendMessage([makeImage()], "test");
    expect(result.usage).toBeUndefined();
  });

  it("extracts reasoning tokens from usage details", async () => {
    mockCreate.mockResolvedValueOnce(
      makeResponse("{}", {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 500,
          completion_tokens_details: { reasoning_tokens: 350 },
        },
      }),
    );

    const result = await makeDriver().sendMessage([makeImage()], "test");
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 500,
      reasoningTokens: 350,
    });
  });

  it("omits reasoning tokens when not present", async () => {
    mockCreate.mockResolvedValueOnce(makeResponse());

    const result = await makeDriver().sendMessage([makeImage()], "test");
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    expect(result.usage).not.toHaveProperty("reasoningTokens");
  });

  it("throws VisualAIAuthError when no API key is available", async () => {
    const saved = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const driver = makeDriver({ apiKey: undefined });
      await expect(driver.sendMessage([makeImage()], "test")).rejects.toThrow(VisualAIAuthError);
    } finally {
      if (saved !== undefined) process.env.OPENROUTER_API_KEY = saved;
    }
  });

  it("falls back to OPENROUTER_API_KEY env variable", async () => {
    const saved = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-key";
    try {
      mockCreate.mockResolvedValueOnce(makeResponse());
      await makeDriver({ apiKey: undefined }).sendMessage([makeImage()], "test");

      const opts = mockConstructor.mock.calls[0]![0] as Record<string, unknown>;
      expect(opts.apiKey).toBe("env-key");
    } finally {
      if (saved !== undefined) process.env.OPENROUTER_API_KEY = saved;
      else delete process.env.OPENROUTER_API_KEY;
    }
  });
});
