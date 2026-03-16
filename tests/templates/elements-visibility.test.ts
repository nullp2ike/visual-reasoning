import { describe, it, expect } from "vitest";
import { buildElementsVisibilityPrompt } from "../../src/templates/elements-visibility.js";

describe("buildElementsVisibilityPrompt", () => {
  it("generates check-format prompt", () => {
    const prompt = buildElementsVisibilityPrompt(["X"], true);
    expect(prompt).toContain('"pass"');
    expect(prompt).toContain('"statements"');
  });

  describe("visible: true", () => {
    it("includes element names in statements", () => {
      const prompt = buildElementsVisibilityPrompt(["Login button", "Header"], true);
      expect(prompt).toContain('"Login button" is fully visible');
      expect(prompt).toContain('"Header" is fully visible');
    });

    it("generates one statement per element", () => {
      const prompt = buildElementsVisibilityPrompt(["A", "B", "C"], true);
      expect(prompt).toContain("1.");
      expect(prompt).toContain("2.");
      expect(prompt).toContain("3.");
    });

    it("includes visible role text", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true);
      expect(prompt).toContain("present and fully visible");
    });

    it("includes default visible instructions", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true);
      expect(prompt).toContain("NOT considered fully visible");
    });

    it("appends user-provided instructions", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true, {
        instructions: ["Custom instruction"],
      });
      expect(prompt).toContain("Custom instruction");
      expect(prompt).toContain("NOT considered fully visible");
    });
  });

  describe("visible: false", () => {
    it("includes NOT visible statements", () => {
      const prompt = buildElementsVisibilityPrompt(["Spinner", "Modal"], false);
      expect(prompt).toContain('"Spinner" is NOT visible');
      expect(prompt).toContain('"Modal" is NOT visible');
    });

    it("includes hidden role text", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], false);
      expect(prompt).toContain("absent or hidden");
    });

    it("includes default hidden instructions", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], false);
      expect(prompt).toContain("NOT considered hidden");
    });

    it("appends user-provided instructions", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], false, {
        instructions: ["Custom instruction"],
      });
      expect(prompt).toContain("Custom instruction");
      expect(prompt).toContain("NOT considered hidden");
    });
  });
});
