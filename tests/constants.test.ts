import { describe, it, expect } from "vitest";
import {
  Provider,
  Model,
  Content,
  Layout,
  Accessibility,
  DEFAULT_MODELS,
  VALID_PROVIDERS,
  MODEL_TO_PROVIDER,
} from "../src/constants.js";

describe("Provider", () => {
  it("has correct provider values", () => {
    expect(Provider.ANTHROPIC).toBe("anthropic");
    expect(Provider.OPENAI).toBe("openai");
    expect(Provider.GOOGLE).toBe("google");
  });

  it("has exactly 3 providers", () => {
    expect(Object.keys(Provider)).toHaveLength(3);
  });
});

describe("Model", () => {
  it("has correct Anthropic model values", () => {
    expect(Model.Anthropic.OPUS_4_6).toBe("claude-opus-4-6");
    expect(Model.Anthropic.SONNET_4_6).toBe("claude-sonnet-4-6");
    expect(Model.Anthropic.HAIKU_4_5).toBe("claude-haiku-4-5");
  });

  it("has correct OpenAI model values", () => {
    expect(Model.OpenAI.GPT_5_4).toBe("gpt-5.4");
    expect(Model.OpenAI.GPT_5_4_PRO).toBe("gpt-5.4-pro");
    expect(Model.OpenAI.GPT_5_2).toBe("gpt-5.2");
    expect(Model.OpenAI.GPT_5_MINI).toBe("gpt-5-mini");
  });

  it("has correct Google model values", () => {
    expect(Model.Google.GEMINI_3_1_PRO_PREVIEW).toBe("gemini-3.1-pro-preview");
    expect(Model.Google.GEMINI_3_FLASH_PREVIEW).toBe("gemini-3-flash-preview");
  });

  it("has no duplicate model values across providers", () => {
    const allModels = [
      ...Object.values(Model.Anthropic),
      ...Object.values(Model.OpenAI),
      ...Object.values(Model.Google),
    ];
    expect(new Set(allModels).size).toBe(allModels.length);
  });
});

describe("DEFAULT_MODELS", () => {
  it("maps each provider to a known model", () => {
    expect(DEFAULT_MODELS[Provider.ANTHROPIC]).toBe(Model.Anthropic.SONNET_4_6);
    expect(DEFAULT_MODELS[Provider.OPENAI]).toBe(Model.OpenAI.GPT_5_MINI);
    expect(DEFAULT_MODELS[Provider.GOOGLE]).toBe(Model.Google.GEMINI_3_FLASH_PREVIEW);
  });

  it("has an entry for every provider", () => {
    for (const provider of Object.values(Provider)) {
      expect(DEFAULT_MODELS[provider]).toBeDefined();
    }
  });
});

describe("MODEL_TO_PROVIDER", () => {
  it("maps all known models to their correct provider", () => {
    for (const model of Object.values(Model.Anthropic)) {
      expect(MODEL_TO_PROVIDER.get(model)).toBe(Provider.ANTHROPIC);
    }
    for (const model of Object.values(Model.OpenAI)) {
      expect(MODEL_TO_PROVIDER.get(model)).toBe(Provider.OPENAI);
    }
    for (const model of Object.values(Model.Google)) {
      expect(MODEL_TO_PROVIDER.get(model)).toBe(Provider.GOOGLE);
    }
  });

  it("has an entry for every known model", () => {
    const allModels = [
      ...Object.values(Model.Anthropic),
      ...Object.values(Model.OpenAI),
      ...Object.values(Model.Google),
    ];
    expect(MODEL_TO_PROVIDER.size).toBe(allModels.length);
  });
});

describe("Content", () => {
  it("has correct check values", () => {
    expect(Content.PLACEHOLDER_TEXT).toBe("placeholder-text");
    expect(Content.ERROR_MESSAGES).toBe("error-messages");
    expect(Content.BROKEN_IMAGES).toBe("broken-images");
    expect(Content.OVERLAPPING_ELEMENTS).toBe("overlapping-elements");
  });

  it("has exactly 4 checks", () => {
    expect(Object.keys(Content)).toHaveLength(4);
  });
});

describe("Layout", () => {
  it("has correct check values", () => {
    expect(Layout.OVERLAP).toBe("overlap");
    expect(Layout.OVERFLOW).toBe("overflow");
    expect(Layout.ALIGNMENT).toBe("alignment");
  });

  it("has exactly 3 checks", () => {
    expect(Object.keys(Layout)).toHaveLength(3);
  });
});

describe("Accessibility", () => {
  it("has correct check values", () => {
    expect(Accessibility.CONTRAST).toBe("contrast");
    expect(Accessibility.READABILITY).toBe("readability");
    expect(Accessibility.INTERACTIVE_VISIBILITY).toBe("interactive-visibility");
  });

  it("has exactly 3 checks", () => {
    expect(Object.keys(Accessibility)).toHaveLength(3);
  });
});

describe("check name uniqueness", () => {
  it("has no duplicate check values across categories", () => {
    const allChecks = [
      ...Object.values(Content),
      ...Object.values(Layout),
      ...Object.values(Accessibility),
    ];
    expect(new Set(allChecks).size).toBe(allChecks.length);
  });
});

describe("VALID_PROVIDERS", () => {
  it("contains all provider values", () => {
    for (const provider of Object.values(Provider)) {
      expect(VALID_PROVIDERS).toContain(provider);
    }
  });

  it("has the same length as Provider keys", () => {
    expect(VALID_PROVIDERS).toHaveLength(Object.keys(Provider).length);
  });
});
