import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_MAX_TOKENS, DEFAULT_MODELS } from "../../src/constants.js";
import { resolveConfig } from "../../src/core/config.js";
import { VisualAIConfigError } from "../../src/errors.js";

const ORIGINAL_ENV = {
  VISUAL_AI_PROVIDER: process.env.VISUAL_AI_PROVIDER,
  VISUAL_AI_MODEL: process.env.VISUAL_AI_MODEL,
  VISUAL_AI_DEBUG: process.env.VISUAL_AI_DEBUG,
  VISUAL_AI_TRACK_USAGE: process.env.VISUAL_AI_TRACK_USAGE,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
};

function restoreEnv(): void {
  if (ORIGINAL_ENV.VISUAL_AI_PROVIDER === undefined) delete process.env.VISUAL_AI_PROVIDER;
  else process.env.VISUAL_AI_PROVIDER = ORIGINAL_ENV.VISUAL_AI_PROVIDER;

  if (ORIGINAL_ENV.VISUAL_AI_MODEL === undefined) delete process.env.VISUAL_AI_MODEL;
  else process.env.VISUAL_AI_MODEL = ORIGINAL_ENV.VISUAL_AI_MODEL;

  if (ORIGINAL_ENV.VISUAL_AI_DEBUG === undefined) delete process.env.VISUAL_AI_DEBUG;
  else process.env.VISUAL_AI_DEBUG = ORIGINAL_ENV.VISUAL_AI_DEBUG;

  if (ORIGINAL_ENV.VISUAL_AI_TRACK_USAGE === undefined) delete process.env.VISUAL_AI_TRACK_USAGE;
  else process.env.VISUAL_AI_TRACK_USAGE = ORIGINAL_ENV.VISUAL_AI_TRACK_USAGE;

  if (ORIGINAL_ENV.ANTHROPIC_API_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_ENV.ANTHROPIC_API_KEY;

  if (ORIGINAL_ENV.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_ENV.OPENAI_API_KEY;

  if (ORIGINAL_ENV.GOOGLE_API_KEY === undefined) delete process.env.GOOGLE_API_KEY;
  else process.env.GOOGLE_API_KEY = ORIGINAL_ENV.GOOGLE_API_KEY;
}

describe("resolveConfig", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("returns a fully resolved provider config with defaults", () => {
    const resolved = resolveConfig({ provider: "openai", apiKey: "test-key" });

    expect(resolved).toEqual({
      provider: "openai",
      apiKey: "test-key",
      model: DEFAULT_MODELS.openai,
      maxTokens: DEFAULT_MAX_TOKENS,
      reasoningEffort: undefined,
      debug: false,
      trackUsage: false,
    });
  });

  it("uses env vars for model and boolean flags when config omits them", () => {
    process.env.VISUAL_AI_MODEL = "gpt-5.4";
    process.env.VISUAL_AI_DEBUG = "true";
    process.env.VISUAL_AI_TRACK_USAGE = "1";

    const resolved = resolveConfig({ provider: "openai", apiKey: "test-key" });

    expect(resolved.model).toBe("gpt-5.4");
    expect(resolved.debug).toBe(true);
    expect(resolved.trackUsage).toBe(true);
  });

  it("lets explicit config values override env flags", () => {
    process.env.VISUAL_AI_DEBUG = "false";
    process.env.VISUAL_AI_TRACK_USAGE = "0";

    const resolved = resolveConfig({
      provider: "google",
      apiKey: "test-key",
      debug: true,
      trackUsage: true,
      maxTokens: 2048,
      reasoningEffort: "high",
    });

    expect(resolved.debug).toBe(true);
    expect(resolved.trackUsage).toBe(true);
    expect(resolved.maxTokens).toBe(2048);
    expect(resolved.reasoningEffort).toBe("high");
  });

  it("infers provider from model prefix", () => {
    const resolved = resolveConfig({
      model: "claude-future-model",
      apiKey: "test-key",
    });

    expect(resolved.provider).toBe("anthropic");
  });

  it("falls back to API key env detection when provider is omitted", () => {
    process.env.GOOGLE_API_KEY = "env-google-key";

    const resolved = resolveConfig({});

    expect(resolved.provider).toBe("google");
    expect(resolved.apiKey).toBeUndefined();
    expect(resolved.model).toBe(DEFAULT_MODELS.google);
  });

  it("throws on model and provider mismatch", () => {
    expect(() =>
      resolveConfig({
        provider: "google",
        model: "claude-sonnet-4-6",
      }),
    ).toThrow(VisualAIConfigError);
  });

  it("throws on invalid VISUAL_AI_DEBUG values", () => {
    process.env.VISUAL_AI_DEBUG = "definitely";

    expect(() => resolveConfig({ provider: "openai" })).toThrow(VisualAIConfigError);
  });
});
