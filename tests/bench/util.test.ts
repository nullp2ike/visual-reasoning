import { describe, it, expect } from "vitest";
import {
  PRIMARY_EFFORT,
  PRIMARY_FIDELITY,
  modelDirName,
  runModelDir,
  seriesId,
} from "../../bench/src/util.js";

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

describe("seriesId", () => {
  it("keeps the bare model name for the primary effort + fidelity (back-compat)", () => {
    expect(seriesId("gpt-5.6-luna", PRIMARY_EFFORT)).toBe("gpt-5.6-luna");
    expect(seriesId("gpt-5.6-luna", PRIMARY_EFFORT, PRIMARY_FIDELITY)).toBe("gpt-5.6-luna");
  });

  it("suffixes non-primary efforts so a model can hold several series", () => {
    expect(seriesId("gpt-5.6-luna", "xhigh")).toBe("gpt-5.6-luna (xhigh)");
    expect(seriesId("gpt-5.6-luna", "xhigh")).not.toBe(seriesId("gpt-5.6-luna", PRIMARY_EFFORT));
  });

  it("tags non-primary image fidelity, combining with effort", () => {
    expect(seriesId("gpt-5.6-luna", PRIMARY_EFFORT, "high")).toBe("gpt-5.6-luna (high-res)");
    expect(seriesId("gpt-5.6-luna", "xhigh", "high")).toBe("gpt-5.6-luna (xhigh, high-res)");
  });
});

describe("runModelDir", () => {
  it("keeps the bare model dir for the primary effort + fidelity (no migration)", () => {
    expect(runModelDir("gpt-5.6-luna", PRIMARY_EFFORT)).toBe("gpt-5.6-luna");
    expect(runModelDir("gpt-5.6-luna", PRIMARY_EFFORT, PRIMARY_FIDELITY)).toBe("gpt-5.6-luna");
    expect(runModelDir("x-ai/grok-4.5", PRIMARY_EFFORT)).toBe("x-ai__grok-4.5");
  });

  it("suffixes non-primary efforts with @<effort> after sanitizing the slug", () => {
    expect(runModelDir("gpt-5.6-luna", "xhigh")).toBe("gpt-5.6-luna@xhigh");
    expect(runModelDir("x-ai/grok-4.5", "high")).toBe("x-ai__grok-4.5@high");
  });

  it("suffixes non-primary fidelity with a distinct @fid-<fidelity> tag", () => {
    expect(runModelDir("gpt-5.6-luna", PRIMARY_EFFORT, "high")).toBe("gpt-5.6-luna@fid-high");
    expect(runModelDir("gpt-5.6-luna", "xhigh", "high")).toBe("gpt-5.6-luna@xhigh@fid-high");
  });
});
