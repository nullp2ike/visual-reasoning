import { describe, it, expect } from "vitest";
import { buildAccessibilityPrompt } from "../../src/templates/accessibility.js";

describe("buildAccessibilityPrompt", () => {
  it("includes all checks by default", () => {
    const prompt = buildAccessibilityPrompt();
    expect(prompt).toContain("contrast");
    expect(prompt).toContain("readable");
    expect(prompt).toContain("interactive");
  });

  it("filters to selected checks", () => {
    const prompt = buildAccessibilityPrompt({ checks: ["contrast"] });
    expect(prompt).toContain("contrast");
    expect(prompt).not.toContain("cut off");
    expect(prompt).not.toContain("interactive elements (buttons");
  });

  it("generates check-format prompt", () => {
    const prompt = buildAccessibilityPrompt();
    expect(prompt).toContain('"pass"');
    expect(prompt).toContain('"statements"');
  });

  it("includes accessibility-specific role", () => {
    const prompt = buildAccessibilityPrompt();
    expect(prompt).toContain("accessibility");
    expect(prompt).toContain("contrast levels");
  });

  it("includes default instructions", () => {
    const prompt = buildAccessibilityPrompt();
    expect(prompt).toContain("Do not state specific contrast ratios");
    expect(prompt).toContain("Dark mode");
  });

  it("appends user-provided instructions", () => {
    const prompt = buildAccessibilityPrompt({
      instructions: ["Custom instruction about focus indicators"],
    });
    expect(prompt).toContain("Custom instruction about focus indicators");
    expect(prompt).toContain("Do not state specific contrast ratios");
  });

  it("does not reference specific WCAG ratios", () => {
    const prompt = buildAccessibilityPrompt();
    expect(prompt).not.toContain("4.5:1");
    expect(prompt).not.toContain("3:1");
  });
});
