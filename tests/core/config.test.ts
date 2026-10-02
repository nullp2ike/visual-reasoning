import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODELS,
  OPENAI_HEAVY_REASONING_MAX_TOKENS,
  OPENAI_REASONING_MAX_TOKENS,
} from "../../src/constants.js";
import { resetDebugDeprecationWarning, resolveConfig } from "../../src/core/config.js";
import { VisualAIConfigError } from "../../src/errors.js";

const ORIGINAL_ENV = {
  VISUAL_AI_MODEL: process.env.VISUAL_AI_MODEL,
  VISUAL_AI_DEBUG: process.env.VISUAL_AI_DEBUG,
  VISUAL_AI_DEBUG_PROMPT: process.env.VISUAL_AI_DEBUG_PROMPT,
  VISUAL_AI_DEBUG_RESPONSE: process.env.VISUAL_AI_DEBUG_RESPONSE,
  VISUAL_AI_TRACK_USAGE: process.env.VISUAL_AI_TRACK_USAGE,
  VISUAL_AI_REASONING_EFFORT: process.env.VISUAL_AI_REASONING_EFFORT,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
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

  if (ORIGINAL_ENV.VISUAL_AI_REASONING_EFFORT === undefined)
    delete process.env.VISUAL_AI_REASONING_EFFORT;
  else process.env.VISUAL_AI_REASONING_EFFORT = ORIGINAL_ENV.VISUAL_AI_REASONING_EFFORT;

  if (ORIGINAL_ENV.ANTHROPIC_API_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_ENV.ANTHROPIC_API_KEY;

  if (ORIGINAL_ENV.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_ENV.OPENAI_API_KEY;

  if (ORIGINAL_ENV.GOOGLE_API_KEY === undefined) delete process.env.GOOGLE_API_KEY;
  else process.env.GOOGLE_API_KEY = ORIGINAL_ENV.GOOGLE_API_KEY;

  if (ORIGINAL_ENV.OPENROUTER_API_KEY === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = ORIGINAL_ENV.OPENROUTER_API_KEY;
}

describe("resolveConfig", () => {
  beforeEach(() => {
    delete process.env.VISUAL_AI_REASONING_EFFORT;
  });

  afterEach(() => {
    restoreEnv();
    resetDebugDeprecationWarning();
  });

  it("returns a fully resolved config with defaults", () => {
    const resolved = resolveConfig({ model: "gpt-5-mini", apiKey: "test-key" });

    expect(resolved).toEqual({
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-5-mini",
      maxTokens: DEFAULT_MAX_TOKENS,
      reasoningEffort: undefined,
      maxImageDimension: 1568,
      imageDetail: "auto",
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

  it("reads reasoningEffort from VISUAL_AI_REASONING_EFFORT when config omits it", () => {
    process.env.VISUAL_AI_REASONING_EFFORT = "high";

    expect(resolveConfig({ model: "gpt-5-mini", apiKey: "test-key" }).reasoningEffort).toBe("high");
  });

  it.each(["minimal", "low", "medium", "high", "xhigh"])(
    "accepts %s from VISUAL_AI_REASONING_EFFORT",
    (level) => {
      process.env.VISUAL_AI_REASONING_EFFORT = level;

      expect(resolveConfig({ model: "gpt-5-mini", apiKey: "test-key" }).reasoningEffort).toBe(
        level,
      );
    },
  );

  it("accepts VISUAL_AI_REASONING_EFFORT case-insensitively", () => {
    process.env.VISUAL_AI_REASONING_EFFORT = "XHigh";

    expect(resolveConfig({ model: "gpt-5-mini", apiKey: "test-key" }).reasoningEffort).toBe(
      "xhigh",
    );
  });

  it("lets an explicit reasoningEffort override VISUAL_AI_REASONING_EFFORT", () => {
    process.env.VISUAL_AI_REASONING_EFFORT = "minimal";

    const resolved = resolveConfig({
      model: "gpt-5-mini",
      apiKey: "test-key",
      reasoningEffort: "high",
    });

    expect(resolved.reasoningEffort).toBe("high");
  });

  it("treats an empty VISUAL_AI_REASONING_EFFORT as unset", () => {
    process.env.VISUAL_AI_REASONING_EFFORT = "";

    expect(
      resolveConfig({ model: "gpt-5-mini", apiKey: "test-key" }).reasoningEffort,
    ).toBeUndefined();
  });

  it("throws on an unrecognised VISUAL_AI_REASONING_EFFORT instead of silently ignoring it", () => {
    process.env.VISUAL_AI_REASONING_EFFORT = "maximum";

    expect(() => resolveConfig({ model: "gpt-5-mini", apiKey: "test-key" })).toThrow(
      VisualAIConfigError,
    );
    expect(() => resolveConfig({ model: "gpt-5-mini", apiKey: "test-key" })).toThrow(
      /VISUAL_AI_REASONING_EFFORT/,
    );
  });

  // The budget rules branch on the effort, so an env-set effort has to raise the
  // OpenAI output budget exactly as a param-set one does.
  it.each(["high", "xhigh"])(
    "raises the OpenAI maxTokens for %s set via VISUAL_AI_REASONING_EFFORT",
    (level) => {
      process.env.VISUAL_AI_REASONING_EFFORT = level;

      expect(resolveConfig({ model: "gpt-5-mini", apiKey: "test-key" }).maxTokens).toBe(
        OPENAI_REASONING_MAX_TOKENS,
      );
    },
  );

  it("leaves the OpenAI maxTokens alone for a low effort set via the env var", () => {
    process.env.VISUAL_AI_REASONING_EFFORT = "low";

    expect(resolveConfig({ model: "gpt-5-mini", apiKey: "test-key" }).maxTokens).toBe(
      DEFAULT_MAX_TOKENS,
    );
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

  it("infers openrouter provider from vendor-prefixed model slugs", () => {
    for (const model of ["x-ai/grok-4.5", "moonshotai/kimi-k3", "somevendor/future-model"]) {
      const resolved = resolveConfig({ model, apiKey: "test-key" });
      expect(resolved.provider).toBe("openrouter");
      expect(resolved.model).toBe(model);
    }
  });

  it("falls back to OPENROUTER_API_KEY detection when model is omitted", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-openrouter-key";

    const resolved = resolveConfig({});

    expect(resolved.provider).toBe("openrouter");
    expect(resolved.model).toBe(DEFAULT_MODELS.openrouter);
  });

  it("throws on invalid VISUAL_AI_DEBUG values", () => {
    process.env.VISUAL_AI_DEBUG = "definitely";
    process.env.OPENAI_API_KEY = "test-key";

    expect(() => resolveConfig({})).toThrow(VisualAIConfigError);
  });

  describe("timeout", () => {
    it("is undefined by default so each SDK keeps its own default", () => {
      const resolved = resolveConfig({ model: "gpt-5-mini", apiKey: "k" });
      expect(resolved.timeout).toBeUndefined();
    });

    it("passes an explicit timeout through unchanged", () => {
      const resolved = resolveConfig({ model: "gpt-5-mini", apiKey: "k", timeout: 60_000 });
      expect(resolved.timeout).toBe(60_000);
    });

    it("rejects a non-positive timeout", () => {
      expect(() => resolveConfig({ model: "gpt-5-mini", apiKey: "k", timeout: 0 })).toThrow(
        VisualAIConfigError,
      );
      expect(() => resolveConfig({ model: "gpt-5-mini", apiKey: "k", timeout: -1 })).toThrow(
        VisualAIConfigError,
      );
    });
  });

  describe("OpenAI auto-increase maxTokens for high reasoning", () => {
    it("increases maxTokens for OpenAI + high effort when user did not set maxTokens", () => {
      const resolved = resolveConfig({
        model: "gpt-5-mini",
        apiKey: "k",
        reasoningEffort: "high",
      });
      expect(resolved.maxTokens).toBe(OPENAI_REASONING_MAX_TOKENS);
    });

    it("increases maxTokens for OpenAI + xhigh effort when user did not set maxTokens", () => {
      const resolved = resolveConfig({
        model: "gpt-5-mini",
        apiKey: "k",
        reasoningEffort: "xhigh",
      });
      expect(resolved.maxTokens).toBe(OPENAI_REASONING_MAX_TOKENS);
    });

    it("preserves user-specified maxTokens even with high reasoning", () => {
      const resolved = resolveConfig({
        model: "gpt-5-mini",
        apiKey: "k",
        reasoningEffort: "high",
        maxTokens: 8192,
      });
      expect(resolved.maxTokens).toBe(8192);
    });

    it("does not increase maxTokens for medium reasoning", () => {
      const resolved = resolveConfig({
        model: "gpt-5-mini",
        apiKey: "k",
        reasoningEffort: "medium",
      });
      expect(resolved.maxTokens).toBe(DEFAULT_MAX_TOKENS);
    });

    it("does not increase maxTokens for Anthropic + high reasoning", () => {
      const resolved = resolveConfig({
        model: "claude-sonnet-4-6",
        apiKey: "k",
        reasoningEffort: "high",
      });
      expect(resolved.maxTokens).toBe(DEFAULT_MAX_TOKENS);
    });

    it("does not increase maxTokens for Google + high reasoning", () => {
      const resolved = resolveConfig({
        model: "gemini-3-flash-preview",
        apiKey: "k",
        reasoningEffort: "high",
      });
      expect(resolved.maxTokens).toBe(DEFAULT_MAX_TOKENS);
    });

    it("increases maxTokens for OpenRouter + high effort when user did not set maxTokens", () => {
      const resolved = resolveConfig({
        model: "x-ai/grok-4.5",
        apiKey: "k",
        reasoningEffort: "high",
      });
      expect(resolved.maxTokens).toBe(OPENAI_REASONING_MAX_TOKENS);
    });

    it("leaves gpt-6-astra at the default budget below high effort", () => {
      // Astra used to get a 32768 budget at every effort because image ask()
      // calls truncated at 4096. The cause was the ask() schema requiring the
      // video-only frameReferences, not reasoning; with that fixed, Astra
      // completes at 4096 and is treated like any other OpenAI model.
      for (const reasoningEffort of [undefined, "low", "medium"] as const) {
        const resolved = resolveConfig({ model: "gpt-6-astra", apiKey: "k", reasoningEffort });
        expect(resolved.maxTokens).toBe(DEFAULT_MAX_TOKENS);
      }
    });

    it("gives gpt-6-astra the standard effort-based increase at high effort", () => {
      const resolved = resolveConfig({
        model: "gpt-6-astra",
        apiKey: "k",
        reasoningEffort: "high",
      });
      expect(resolved.maxTokens).toBe(OPENAI_REASONING_MAX_TOKENS);
    });

    it.each(["qwen/qwen3.8-max", "qwen/qwen3.7-plus"])(
      "increases maxTokens for %s at every effort level, not just high",
      (model) => {
        // Verified live at the 4096 default with the ask() schema fix in place:
        // these models genuinely reason past 4096 (4500-5400 reasoning tokens,
        // under 600 visible) and truncate on ask() and, for qwen3.8-max, check().
        // With the large budget both completed 16/16 live calls.
        for (const reasoningEffort of [undefined, "low", "medium", "high"] as const) {
          const resolved = resolveConfig({ model, apiKey: "k", reasoningEffort });
          expect(resolved.maxTokens).toBe(OPENAI_HEAVY_REASONING_MAX_TOKENS);
        }
      },
    );

    it("leaves kimi-k2.7-code at the default budget", () => {
      // Its truncated calls are ones where it writes prose instead of JSON; a
      // larger budget turns them into parse errors rather than fixing them.
      const resolved = resolveConfig({
        model: "moonshotai/kimi-k2.7-code",
        apiKey: "k",
        reasoningEffort: "medium",
      });
      expect(resolved.maxTokens).toBe(DEFAULT_MAX_TOKENS);
    });

    it("preserves user-specified maxTokens for heavy-reasoning OpenRouter models", () => {
      const resolved = resolveConfig({ model: "qwen/qwen3.8-max", apiKey: "k", maxTokens: 2048 });
      expect(resolved.maxTokens).toBe(2048);
    });

    it("does not increase maxTokens for other OpenAI models at default effort", () => {
      const resolved = resolveConfig({ model: "gpt-5.6-luna", apiKey: "k" });
      expect(resolved.maxTokens).toBe(DEFAULT_MAX_TOKENS);
    });

    it("gives heavy reasoners more than the effort-based increase", () => {
      // OpenAI's reasoning guide recommends reserving at least 25,000 tokens;
      // the effort-based 16384 sits below that and Astra truncated at it.
      expect(OPENAI_HEAVY_REASONING_MAX_TOKENS).toBeGreaterThan(25_000);
      expect(OPENAI_HEAVY_REASONING_MAX_TOKENS).toBeGreaterThan(OPENAI_REASONING_MAX_TOKENS);
    });

    it("emits debug log when auto-increase triggers", () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      resolveConfig({
        model: "gpt-5-mini",
        apiKey: "k",
        reasoningEffort: "high",
        debug: true,
      });
      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("Auto-increased maxTokens"))).toBe(true);
      stderrSpy.mockRestore();
    });

    it("does not emit debug log when debug is false", () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      resolveConfig({
        model: "gpt-5-mini",
        apiKey: "k",
        reasoningEffort: "high",
      });
      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("Auto-increased maxTokens"))).toBe(false);
      stderrSpy.mockRestore();
    });
  });

  describe("debugPrompt / debugResponse resolution", () => {
    it("defaults to false when debug is false", () => {
      const resolved = resolveConfig({ model: "gpt-5-mini", apiKey: "k" });
      expect(resolved.debugPrompt).toBe(false);
      expect(resolved.debugResponse).toBe(false);
    });

    it("does not inherit from debug=true", () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const resolved = resolveConfig({ model: "gpt-5-mini", apiKey: "k", debug: true });
      expect(resolved.debugPrompt).toBe(false);
      expect(resolved.debugResponse).toBe(false);
      stderrSpy.mockRestore();
    });

    it("does not inherit from VISUAL_AI_DEBUG env var", () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      process.env.VISUAL_AI_DEBUG = "true";
      const resolved = resolveConfig({ model: "gpt-5-mini", apiKey: "k" });
      expect(resolved.debugPrompt).toBe(false);
      expect(resolved.debugResponse).toBe(false);
      stderrSpy.mockRestore();
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

    it("config.debugPrompt=false stays false even when debug=true", () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const resolved = resolveConfig({
        model: "gpt-5-mini",
        apiKey: "k",
        debug: true,
        debugPrompt: false,
      });
      expect(resolved.debug).toBe(true);
      expect(resolved.debugPrompt).toBe(false);
      expect(resolved.debugResponse).toBe(false);
      stderrSpy.mockRestore();
    });

    it("config.debugResponse=false stays false even when debug=true", () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const resolved = resolveConfig({
        model: "gpt-5-mini",
        apiKey: "k",
        debug: true,
        debugResponse: false,
      });
      expect(resolved.debug).toBe(true);
      expect(resolved.debugPrompt).toBe(false);
      expect(resolved.debugResponse).toBe(false);
      stderrSpy.mockRestore();
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

    it("emits deprecation warning when debug=true without granular vars", () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      resolveConfig({ model: "gpt-5-mini", apiKey: "k", debug: true });
      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(
        calls.some((c) => c.includes("VISUAL_AI_DEBUG no longer enables prompt/response")),
      ).toBe(true);
      stderrSpy.mockRestore();
    });

    it("does not emit deprecation warning when debug=true with debugPrompt=true", () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      resolveConfig({ model: "gpt-5-mini", apiKey: "k", debug: true, debugPrompt: true });
      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(
        calls.some((c) => c.includes("VISUAL_AI_DEBUG no longer enables prompt/response")),
      ).toBe(false);
      stderrSpy.mockRestore();
    });

    it("does not emit deprecation warning when debug=false", () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      resolveConfig({ model: "gpt-5-mini", apiKey: "k" });
      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(
        calls.some((c) => c.includes("VISUAL_AI_DEBUG no longer enables prompt/response")),
      ).toBe(false);
      stderrSpy.mockRestore();
    });
  });
});
