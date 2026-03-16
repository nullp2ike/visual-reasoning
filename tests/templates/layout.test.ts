import { describe, it, expect } from "vitest";
import { buildLayoutPrompt } from "../../src/templates/layout.js";

describe("buildLayoutPrompt", () => {
  it("includes all checks by default", () => {
    const prompt = buildLayoutPrompt();
    expect(prompt).toContain("overlap");
    expect(prompt).toContain("cut off");
    expect(prompt).toContain("aligned");
  });

  it("filters to selected checks", () => {
    const prompt = buildLayoutPrompt({ checks: ["overlap", "overflow"] });
    expect(prompt).toContain("overlap");
    expect(prompt).toContain("cut off");
  });

  it("generates check-format prompt", () => {
    const prompt = buildLayoutPrompt();
    expect(prompt).toContain('"pass"');
  });

  it("includes layout-specific role", () => {
    const prompt = buildLayoutPrompt();
    expect(prompt).toContain("layout problems");
  });

  it("includes default instructions", () => {
    const prompt = buildLayoutPrompt();
    expect(prompt).toContain("Intentional overlaps");
    expect(prompt).toContain("Scrollable containers");
  });

  it("appends user-provided instructions", () => {
    const prompt = buildLayoutPrompt({
      instructions: ["Ignore sidebar overflow"],
    });
    expect(prompt).toContain("Ignore sidebar overflow");
    expect(prompt).toContain("Intentional overlaps");
  });

  it("does not reference visible viewport", () => {
    const prompt = buildLayoutPrompt();
    expect(prompt).not.toContain("visible viewport");
  });
});
