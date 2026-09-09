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
      expect(prompt).toContain(
        "present, properly visible, correctly rendered, and in their finished state",
      );
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

    it("keeps an element visible under decorative chrome drawn on top of it", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true);
      expect(prompt).toContain("Judge each element in its finished, presented state");
      expect(prompt).toContain("a duration or price pill");
      expect(prompt).toMatch(/coexist with finished content and leave it visible/);
    });

    it("fails an element under an overlay that says it is not ready", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true);
      expect(prompt).toContain("a loading spinner, a skeleton placeholder, a shimmer");
      expect(prompt).toMatch(
        /not properly visible even when you can still make out what sits underneath/,
      );
    });

    it("fails an element a blocking overlay covers", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true);
      expect(prompt).toContain("modal, dialog, cookie banner, toast");
      expect(prompt).toMatch(/could not read or use/);
    });

    it("appends user-provided instructions alongside the edge rules", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true, {
        instructions: ["Custom instruction"],
      });
      expect(prompt).toContain("Custom instruction");
      expect(prompt).toContain("NOT properly visible");
    });

    it("defaults to judging the finished state", () => {
      const implicit = buildElementsVisibilityPrompt(["X"], true);
      const explicit = buildElementsVisibilityPrompt(["X"], true, { finalState: true });
      expect(implicit).toBe(explicit);
      expect(implicit).toContain("Judge each element in its finished, presented state");
    });

    it("drops the finished-state rule and role when the screen is mid-load", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true, { finalState: false });
      expect(prompt).not.toContain("Judge each element in its finished, presented state");
      expect(prompt).not.toContain("a loading spinner, a skeleton placeholder, a shimmer");
      expect(prompt).not.toContain("in their finished state");
      expect(prompt).toContain("present, properly visible, and correctly rendered");
    });

    it("keeps clipping and blocking-overlay rules when the screen is mid-load", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true, { finalState: false });
      expect(prompt).toContain("ordinary scrolling would bring it fully into view");
      expect(prompt).toContain("layout fault");
      expect(prompt).toContain("Judge only what this screenshot actually shows");
      expect(prompt).toContain("modal, dialog, cookie banner, toast");
    });

    it("judges presentation as well as presence by default", () => {
      const implicit = buildElementsVisibilityPrompt(["X"], true);
      const explicit = buildElementsVisibilityPrompt(["X"], true, {
        requireCorrectRendering: true,
      });
      expect(implicit).toBe(explicit);
      expect(implicit).toContain("clearly defective in how it is rendered");
    });

    it("drops to a pure presence check when asked", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true, {
        requireCorrectRendering: false,
      });
      expect(prompt).not.toContain("clearly defective in how it is rendered");
      expect(prompt).not.toContain("correctly rendered");
      expect(prompt).toContain("present, properly visible, and in their finished state");
      // Everything unrelated to rendering quality survives.
      expect(prompt).toContain("ordinary scrolling would bring it fully into view");
      expect(prompt).toContain("modal, dialog, cookie banner, toast");
    });

    it("fails a present but badly rendered element", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true);
      expect(prompt).toContain("present but clearly defective in how it is rendered");
      expect(prompt).toContain("contrast too low to read");
      expect(prompt).toContain("overlapping or colliding");
      expect(prompt).toContain("out of alignment with the siblings");
      expect(prompt).toContain("cut off mid-word inside its own container");
    });

    it("tells the model to say the element is present before naming the defect", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true);
      expect(prompt).toMatch(/say that the element is present and then name the defect/);
    });

    it("draws a line at unambiguous defects, to curb over-reporting", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true);
      expect(prompt).toContain("Only clear, unambiguous defects count");
      expect(prompt).toContain("do not fail an element for tight spacing");
    });

    it("names only the enabled judgements in the role", () => {
      const both = buildElementsVisibilityPrompt(["X"], true, { requireCorrectRendering: true });
      expect(both).toContain(
        "present, properly visible, correctly rendered, and in their finished state",
      );
      const renderingOnly = buildElementsVisibilityPrompt(["X"], true, {
        requireCorrectRendering: true,
        finalState: false,
      });
      expect(renderingOnly).toContain("present, properly visible, and correctly rendered");
      expect(renderingOnly).not.toContain("finished state");
    });

    it("keeps the correctness rule alongside clipping and overlay rules", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true);
      expect(prompt).toContain("ordinary scrolling would bring it fully into view");
      expect(prompt).toContain("modal, dialog, cookie banner, toast");
      expect(prompt).toContain("Judge each element in its finished, presented state");
    });

    it("still appends user instructions when the finished-state rule is dropped", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true, {
        finalState: false,
        instructions: ["Ignore the skeleton rows"],
      });
      expect(prompt).toContain("Ignore the skeleton rows");
      expect(prompt).not.toContain("Judge each element in its finished, presented state");
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

    it("treats an element under a state overlay as rendered, so not hidden", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], false);
      expect(prompt).toContain("under a loading spinner, skeleton, progress bar or error overlay");
      expect(prompt).toMatch(/still rendered, so it is not hidden/);
    });

    it("appends user-provided instructions alongside the edge rules", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], false, {
        instructions: ["Custom instruction"],
      });
      expect(prompt).toContain("Custom instruction");
      expect(prompt).toContain("is not hidden");
    });

    it("ignores requireCorrectRendering, since absence cannot be badly rendered", () => {
      const plain = buildElementsVisibilityPrompt(["X"], false);
      for (const requireCorrectRendering of [true, false]) {
        expect(buildElementsVisibilityPrompt(["X"], false, { requireCorrectRendering })).toBe(
          plain,
        );
      }
      expect(plain).not.toContain("clearly defective in how it is rendered");
    });

    it("drops the state-overlay rule when the screen is mid-load", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], false, { finalState: false });
      expect(prompt).not.toContain(
        "under a loading spinner, skeleton, progress bar or error overlay",
      );
      expect(prompt).toContain("rendered at all, even partly, is not hidden");
      expect(prompt).toContain("appears nowhere in this screenshot counts as hidden");
      // The hidden role never mentioned state, so it is unchanged either way.
      expect(prompt).toContain("absent or hidden");
    });
  });
});
