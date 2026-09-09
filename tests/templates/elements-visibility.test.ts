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
      expect(prompt).toContain('"Login button" is visible');
      expect(prompt).toContain('"Header" is visible');
    });

    it("generates one statement per element", () => {
      const prompt = buildElementsVisibilityPrompt(["A", "B", "C"], true);
      expect(prompt).toContain("1.");
      expect(prompt).toContain("2.");
      expect(prompt).toContain("3.");
    });

    it("includes visible role text", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true);
      expect(prompt).toContain("present and properly visible");
    });

    it("passes an element reached by ordinary scrolling", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true);
      expect(prompt).toContain("ordinary scrolling would bring it fully into view");
      expect(prompt).toContain("horizontal carousel");
      expect(prompt).toMatch(/reachable that way, so the check for that element PASSES/);
    });

    it("fails an element clipped by fixed chrome, as a layout fault", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true);
      expect(prompt).toContain("scrolling cannot bring into view is NOT properly visible");
      expect(prompt).toContain("status bar");
      expect(prompt).toContain("home indicator");
      expect(prompt).toMatch(/layout fault, so the check for that element FAILS/);
    });

    it("refuses to assume an unseen element exists further down the page", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true);
      expect(prompt).toContain("Judge only what this screenshot actually shows");
    });

    it("appends user-provided instructions alongside the edge rules", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true, {
        instructions: ["Custom instruction"],
      });
      expect(prompt).toContain("Custom instruction");
      expect(prompt).toContain("NOT properly visible");
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

    it("treats any rendered element, even a peeking one, as not hidden", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], false);
      expect(prompt).toContain("rendered at all, even partly, is not hidden");
      expect(prompt).toContain("peeking past the edge of a scrollable row");
    });

    it("counts an element absent from the screenshot as hidden", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], false);
      expect(prompt).toContain("appears nowhere in this screenshot counts as hidden");
    });

    it("appends user-provided instructions alongside the edge rules", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], false, {
        instructions: ["Custom instruction"],
      });
      expect(prompt).toContain("Custom instruction");
      expect(prompt).toContain("is not hidden");
    });
  });
});
