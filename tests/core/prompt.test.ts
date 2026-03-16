import { describe, it, expect } from "vitest";
import {
  buildAskPrompt,
  buildCheckPrompt,
  buildComparePrompt,
  buildAiDiffCodeExecutionPrompt,
} from "../../src/core/prompt.js";

describe("buildCheckPrompt", () => {
  it("includes single statement", () => {
    const prompt = buildCheckPrompt("The login button is visible");
    expect(prompt).toContain("The login button is visible");
    expect(prompt).toContain("JSON");
    expect(prompt).toContain('"pass"');
    expect(prompt).toContain('"statements"');
  });

  it("includes multiple statements numbered", () => {
    const prompt = buildCheckPrompt(["Button visible", "Header exists"]);
    expect(prompt).toContain('1. "Button visible"');
    expect(prompt).toContain('2. "Header exists"');
  });

  it("includes issue schema instructions", () => {
    const prompt = buildCheckPrompt("test");
    expect(prompt).toContain('"priority"');
    expect(prompt).toContain('"category"');
    expect(prompt).toContain('"description"');
    expect(prompt).toContain('"suggestion"');
  });

  it("includes example for consistent output", () => {
    const prompt = buildCheckPrompt("test");
    expect(prompt).toContain("Example");
  });

  it("includes confidence field in output schema", () => {
    const prompt = buildCheckPrompt("test");
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain("high");
    expect(prompt).toContain("medium");
    expect(prompt).toContain("low");
  });

  it("uses default role when none provided", () => {
    const prompt = buildCheckPrompt("test");
    expect(prompt).toContain("visual QA assistant");
  });

  it("uses custom role when provided", () => {
    const prompt = buildCheckPrompt("test", {
      role: "You are a layout expert.",
    });
    expect(prompt).toContain("layout expert");
    expect(prompt).not.toContain("visual QA assistant");
  });

  it("includes instructions when provided", () => {
    const prompt = buildCheckPrompt("test", {
      instructions: ["Treat dark mode as valid.", "Ignore minor spacing."],
    });
    expect(prompt).toContain("Additional instructions:");
    expect(prompt).toContain("- Treat dark mode as valid.");
    expect(prompt).toContain("- Ignore minor spacing.");
  });

  it("omits instructions section when none provided", () => {
    const prompt = buildCheckPrompt("test");
    expect(prompt).not.toContain("Additional instructions:");
  });

  it("omits instructions section when empty array provided", () => {
    const prompt = buildCheckPrompt("test", { instructions: [] });
    expect(prompt).not.toContain("Additional instructions:");
  });
});

describe("buildAskPrompt", () => {
  it("includes user prompt", () => {
    const prompt = buildAskPrompt("Analyze this page");
    expect(prompt).toContain("Analyze this page");
  });

  it("requests JSON with summary and issues", () => {
    const prompt = buildAskPrompt("test");
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"issues"');
    expect(prompt).toContain("JSON");
  });

  it("includes priority guidance", () => {
    const prompt = buildAskPrompt("test");
    expect(prompt).toContain("critical");
    expect(prompt).toContain("major");
    expect(prompt).toContain("minor");
  });
});

describe("buildComparePrompt", () => {
  it("includes user prompt when provided", () => {
    const prompt = buildComparePrompt({ userPrompt: "Describe differences" });
    expect(prompt).toContain("Describe differences");
  });

  it("uses default evaluation when no prompt provided", () => {
    const prompt = buildComparePrompt();
    expect(prompt).toContain("Identify all visual differences");
  });

  it("mentions before and after", () => {
    const prompt = buildComparePrompt({ userPrompt: "test" });
    expect(prompt).toContain("BEFORE");
    expect(prompt).toContain("AFTER");
  });

  it("requests CompareResult format with changes array", () => {
    const prompt = buildComparePrompt({ userPrompt: "test" });
    expect(prompt).toContain('"pass"');
    expect(prompt).toContain('"changes"');
    expect(prompt).toContain('"description"');
    expect(prompt).toContain('"severity"');
  });

  it("does not request issues or statements arrays", () => {
    const prompt = buildComparePrompt({ userPrompt: "test" });
    expect(prompt).not.toContain('"issues"');
    expect(prompt).not.toContain('"statements"');
  });

  it("includes regression testing instructions", () => {
    const prompt = buildComparePrompt();
    expect(prompt).toContain("baseline");
    expect(prompt).toContain("Additional instructions:");
  });

  it("appends user-provided instructions to defaults", () => {
    const prompt = buildComparePrompt({
      instructions: ["Ignore favicon differences"],
    });
    expect(prompt).toContain("Ignore favicon differences");
    expect(prompt).toContain("baseline");
  });
});

describe("buildAiDiffCodeExecutionPrompt", () => {
  it("instructs model to write Python code with matplotlib", () => {
    const prompt = buildAiDiffCodeExecutionPrompt();
    expect(prompt).toContain("Python");
    expect(prompt).toContain("matplotlib");
  });

  it("includes annotation requirements", () => {
    const prompt = buildAiDiffCodeExecutionPrompt();
    expect(prompt).toContain("red");
    expect(prompt).toContain("differences");
  });
});
