import { describe, it, expect } from "vitest";
import { buildContentPrompt } from "../../src/templates/content.js";

describe("buildContentPrompt", () => {
  it("includes all checks by default", () => {
    const prompt = buildContentPrompt();
    expect(prompt).toContain("placeholder");
    expect(prompt).toContain("error");
    expect(prompt).toContain("broken image");
    expect(prompt).toContain("overlapping");
  });

  it("filters to selected checks", () => {
    const prompt = buildContentPrompt({ checks: ["placeholder-text"] });
    expect(prompt).toContain("placeholder");
    expect(prompt).not.toContain("broken image");
  });

  it("generates check-format prompt", () => {
    const prompt = buildContentPrompt();
    expect(prompt).toContain('"pass"');
  });

  it("includes content-specific role", () => {
    const prompt = buildContentPrompt();
    expect(prompt).toContain("content quality");
  });

  it("appends user-provided instructions", () => {
    const prompt = buildContentPrompt({
      instructions: ["Ignore copyright placeholder text"],
    });
    expect(prompt).toContain("Ignore copyright placeholder text");
  });
});
