import { describe, it, expect } from "vitest";
import * as mod from "../src/index.js";

describe("public API exports", () => {
  it("exports visualAI function", () => {
    expect(mod.visualAI).toBeTypeOf("function");
  });

  it("exports Zod schemas", () => {
    expect(mod.CheckResultSchema).toBeDefined();
    expect(mod.CompareResultSchema).toBeDefined();
    expect(mod.ChangeEntrySchema).toBeDefined();
    expect(mod.ConfidenceSchema).toBeDefined();
    expect(mod.AskResultSchema).toBeDefined();
    expect(mod.IssueSchema).toBeDefined();
    expect(mod.IssuePrioritySchema).toBeDefined();
    expect(mod.IssueCategorySchema).toBeDefined();
    expect(mod.StatementResultSchema).toBeDefined();
    expect(mod.UsageInfoSchema).toBeDefined();
  });

  it("exports error classes", () => {
    expect(mod.VisualAIError).toBeTypeOf("function");
    expect(mod.VisualAIAuthError).toBeTypeOf("function");
    expect(mod.VisualAIRateLimitError).toBeTypeOf("function");
    expect(mod.VisualAIProviderError).toBeTypeOf("function");
    expect(mod.VisualAIImageError).toBeTypeOf("function");
    expect(mod.VisualAIResponseParseError).toBeTypeOf("function");
    expect(mod.VisualAIConfigError).toBeTypeOf("function");
    expect(mod.VisualAIAssertionError).toBeTypeOf("function");
    expect(mod.isVisualAIKnownError).toBeTypeOf("function");
  });

  it("exports Provider and Model constants", () => {
    expect(mod.Provider).toBeDefined();
    expect(mod.Provider.ANTHROPIC).toBe("anthropic");
    expect(mod.Model).toBeDefined();
    expect(mod.Model.Anthropic.SONNET_4_6).toBe("claude-sonnet-4-6");
  });

  it("exports Content, Layout, and Accessibility constants", () => {
    expect(mod.Content.PLACEHOLDER_TEXT).toBe("placeholder-text");
    expect(mod.Layout.OVERLAP).toBe("overlap");
    expect(mod.Accessibility.CONTRAST).toBe("contrast");
  });

  it("exports DEFAULT_MODELS", () => {
    expect(mod.DEFAULT_MODELS).toBeDefined();
  });

  it("error classes inherit from VisualAIError", () => {
    expect(new mod.VisualAIAuthError("test")).toBeInstanceOf(mod.VisualAIError);
    expect(new mod.VisualAIRateLimitError("test")).toBeInstanceOf(mod.VisualAIError);
    expect(new mod.VisualAIProviderError("test")).toBeInstanceOf(mod.VisualAIError);
    expect(new mod.VisualAIImageError("test")).toBeInstanceOf(mod.VisualAIError);
    expect(new mod.VisualAIResponseParseError("test", "raw")).toBeInstanceOf(mod.VisualAIError);
    expect(new mod.VisualAIConfigError("test")).toBeInstanceOf(mod.VisualAIError);
  });
});
