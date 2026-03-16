import { describe, it, expect } from "vitest";
import { buildPageLoadPrompt } from "../../src/templates/page-load.js";

describe("buildPageLoadPrompt", () => {
  it("defaults to expecting loaded state", () => {
    const prompt = buildPageLoadPrompt();
    expect(prompt).toContain("finished loading");
    expect(prompt).toContain("spinning indicators");
  });

  it("checks for loaded state when expectLoaded is true", () => {
    const prompt = buildPageLoadPrompt({ expectLoaded: true });
    expect(prompt).toContain("finished loading");
  });

  it("checks for loading state when expectLoaded is false", () => {
    const prompt = buildPageLoadPrompt({ expectLoaded: false });
    expect(prompt).toContain("loading state");
  });

  it("includes page-load-specific role", () => {
    const prompt = buildPageLoadPrompt();
    expect(prompt).toContain("finished loading");
  });

  it("appends user-provided instructions", () => {
    const prompt = buildPageLoadPrompt({
      instructions: ["Lazy-loaded images below fold are acceptable"],
    });
    expect(prompt).toContain("Lazy-loaded images below fold are acceptable");
  });
});
