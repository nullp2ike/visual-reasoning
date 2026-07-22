import { describe, it, expect } from "vitest";
import { modelDirName } from "../../bench/src/util.js";

describe("modelDirName", () => {
  it("passes through first-party model names unchanged", () => {
    expect(modelDirName("claude-opus-4-8")).toBe("claude-opus-4-8");
    expect(modelDirName("gpt-5.5")).toBe("gpt-5.5");
  });

  it("replaces slashes in OpenRouter slugs so they stay one directory level", () => {
    expect(modelDirName("x-ai/grok-4.5")).toBe("x-ai__grok-4.5");
    expect(modelDirName("moonshotai/kimi-k2.7-code")).toBe("moonshotai__kimi-k2.7-code");
  });

  it("produces distinct names for distinct slugs", () => {
    expect(modelDirName("qwen/qwen3.7-plus")).not.toBe(modelDirName("qwen/qwen3.6-flash"));
  });
});
