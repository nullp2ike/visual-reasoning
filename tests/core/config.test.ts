import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_MAX_TOKENS, DEFAULT_MODELS } from "../../src/constants.js";
import { resolveConfig } from "../../src/core/config.js";
import { VisualAIConfigError } from "../../src/errors.js";

const ORIGINAL_ENV = {
  VISUAL_AI_MODEL: process.env.VISUAL_AI_MODEL,
  VISUAL_AI_DEBUG: process.env.VISUAL_AI_DEBUG,
  VISUAL_AI_DEBUG_PROMPT: process.env.VISUAL_AI_DEBUG_PROMPT,
  VISUAL_AI_DEBUG_RESPONSE: process.env.VISUAL_AI_DEBUG_RESPONSE,
  VISUAL_AI_TRACK_USAGE: process.env.VISUAL_AI_TRACK_USAGE,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
};

function restoreEnv(): void {
  if (ORIGINAL_ENV.VISUAL_AI_MODEL === undefined) delete process.env.VISUAL_AI_MODEL;
  else process.env.VISUAL_AI_MODEL = ORIGINAL_ENV.VISUAL_AI_MODEL;

  if (ORIGINAL_ENV.VISUAL_AI_DEBUG === undefined) delete process.env.VISUAL_AI_DEBUG;
  else process.env.VISUAL_AI_DEBUG = ORIGINAL_ENV.VISUAL_AI_DEBUG;

  if (ORIGINAL_ENV.VISUAL_AI_DEBUG_PROMPT === undefined) delete process.env.VISUAL_AI_DEBUG_PROMPT;
  else process.env.VISUAL_AI_DEBUG_PROMPT = ORIGINAL_ENV.VISUAL_AI_DEBUG_PROMPT;

  if (ORIGINAL_ENV.VISUAL_AI_DEBUG_RESPONSE === undefined)
    delete process.env.VISUAL_AI_DEBUG_RESPONSE;
  else process.env.VISUAL_AI_DEBUG_RESPONSE = ORIGINAL_ENV.VISUAL_AI_DEBUG_RESPONSE;

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

  it("returns a fully resolved config with defaults", () => {
    const resolved = resolveConfig({ model: "gpt-5-mini", apiKey: "test-key" });

    expect(resolved).toEqual({
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: DEFAULT_MAX_TOKENS,
      reasoningEffort: undefined,
      debug: false,
      debugPrompt: false,
      debugResponse: false,
      trackUsage: false,
    });
  });

  it("uses env vars for model and boolean flags when config omits them", () => {
    process.env.VISUAL_AI_MODEL = "gpt-5.4";
    process.env.VISUAL_AI_DEBUG = "true";
    process.env.VISUAL_AI_TRACK_USAGE = "1";

    const resolved = resolveConfig({ apiKey: "test-key" });

    expect(resolved.model).toBe("gpt-5.4");
    expect(resolved.debug).toBe(true);
    expect(resolved.trackUsage).toBe(true);
  });

  it("lets explicit config values override env flags", () => {
    process.env.VISUAL_AI_DEBUG = "false";
    process.env.VISUAL_AI_TRACK_USAGE = "0";

    const resolved = resolveConfig({
      model: "gemini-3-flash-preview",
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

  it("falls back to API key env detection when model is omitted", () => {
    process.env.GOOGLE_API_KEY = "env-google-key";

    const resolved = resolveConfig({});

    expect(resolved.provider).toBe("google");
    expect(resolved.apiKey).toBeUndefined();
    expect(resolved.model).toBe(DEFAULT_MODELS.google);
  });

  it("throws on invalid VISUAL_AI_DEBUG values", () => {
    process.env.VISUAL_AI_DEBUG = "definitely";
    process.env.OPENAI_API_KEY = "test-key";

    expect(() => resolveConfig({})).toThrow(VisualAIConfigError);
  });

  describe("debugPrompt / debugResponse resolution", () => {
    it("defaults to false when debug is false", () => {
      const resolved = resolveConfig({ model: "gpt-5-mini", apiKey: "k" });
      expect(resolved.debugPrompt).toBe(false);
      expect(resolved.debugResponse).toBe(false);
    });

    it("inherits from debug=true when not explicitly set", () => {
      const resolved = resolveConfig({ model: "gpt-5-mini", apiKey: "k", debug: true });
      expect(resolved.debugPrompt).toBe(true);
      expect(resolved.debugResponse).toBe(true);
    });

    it("inherits from VISUAL_AI_DEBUG env var", () => {
      process.env.VISUAL_AI_DEBUG = "true";
      const resolved = resolveConfig({ model: "gpt-5-mini", apiKey: "k" });
      expect(resolved.debugPrompt).toBe(true);
      expect(resolved.debugResponse).toBe(true);
    });

    it("VISUAL_AI_DEBUG_PROMPT=true enables prompt logging independently", () => {
      process.env.VISUAL_AI_DEBUG_PROMPT = "true";
      const resolved = resolveConfig({ model: "gpt-5-mini", apiKey: "k" });
      expect(resolved.debug).toBe(false);
      expect(resolved.debugPrompt).toBe(true);
      expect(resolved.debugResponse).toBe(false);
    });

    it("VISUAL_AI_DEBUG_RESPONSE=1 enables response logging independently", () => {
      process.env.VISUAL_AI_DEBUG_RESPONSE = "1";
      const resolved = resolveConfig({ model: "gpt-5-mini", apiKey: "k" });
      expect(resolved.debug).toBe(false);
      expect(resolved.debugPrompt).toBe(false);
      expect(resolved.debugResponse).toBe(true);
    });

    it("config.debugPrompt overrides VISUAL_AI_DEBUG_PROMPT env", () => {
      process.env.VISUAL_AI_DEBUG_PROMPT = "true";
      const resolved = resolveConfig({
        model: "gpt-5-mini",
        apiKey: "k",
        debugPrompt: false,
      });
      expect(resolved.debugPrompt).toBe(false);
    });

    it("config.debugResponse overrides VISUAL_AI_DEBUG_RESPONSE env", () => {
      process.env.VISUAL_AI_DEBUG_RESPONSE = "true";
      const resolved = resolveConfig({
        model: "gpt-5-mini",
        apiKey: "k",
        debugResponse: false,
      });
      expect(resolved.debugResponse).toBe(false);
    });

    it("config.debugPrompt=false suppresses even when debug=true", () => {
      const resolved = resolveConfig({
        model: "gpt-5-mini",
        apiKey: "k",
        debug: true,
        debugPrompt: false,
      });
      expect(resolved.debug).toBe(true);
      expect(resolved.debugPrompt).toBe(false);
      expect(resolved.debugResponse).toBe(true);
    });

    it("config.debugResponse=false suppresses even when debug=true", () => {
      const resolved = resolveConfig({
        model: "gpt-5-mini",
        apiKey: "k",
        debug: true,
        debugResponse: false,
      });
      expect(resolved.debug).toBe(true);
      expect(resolved.debugPrompt).toBe(true);
      expect(resolved.debugResponse).toBe(false);
    });

    it("throws on invalid VISUAL_AI_DEBUG_PROMPT values", () => {
      process.env.VISUAL_AI_DEBUG_PROMPT = "maybe";
      process.env.OPENAI_API_KEY = "test-key";
      expect(() => resolveConfig({})).toThrow(/Invalid VISUAL_AI_DEBUG_PROMPT value/);
    });

    it("throws on invalid VISUAL_AI_DEBUG_RESPONSE values", () => {
      process.env.VISUAL_AI_DEBUG_RESPONSE = "yes";
      process.env.OPENAI_API_KEY = "test-key";
      expect(() => resolveConfig({})).toThrow(/Invalid VISUAL_AI_DEBUG_RESPONSE value/);
    });

    it("empty VISUAL_AI_DEBUG_PROMPT treated as unset", () => {
      process.env.VISUAL_AI_DEBUG_PROMPT = "";
      const resolved = resolveConfig({ model: "gpt-5-mini", apiKey: "k" });
      expect(resolved.debugPrompt).toBe(false);
    });

    it("empty VISUAL_AI_DEBUG_RESPONSE treated as unset", () => {
      process.env.VISUAL_AI_DEBUG_RESPONSE = "";
      const resolved = resolveConfig({ model: "gpt-5-mini", apiKey: "k" });
      expect(resolved.debugResponse).toBe(false);
    });
  });
});
