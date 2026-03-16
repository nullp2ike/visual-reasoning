import { describe, it, expect } from "vitest";
import type { CheckResult, CompareResult } from "../src/types.js";
import { VisualAIAssertionError } from "../src/errors.js";
import {
  formatCheckResult,
  formatCompareResult,
  assertVisualResult,
  assertVisualCompareResult,
} from "../src/format.js";

const passingCheck: CheckResult = {
  pass: true,
  reasoning: "All checks passed.",
  issues: [],
  statements: [
    {
      statement: "The page has a logo",
      pass: true,
      reasoning: "Logo visible in header",
      confidence: "high",
    },
  ],
};

const failingCheck: CheckResult = {
  pass: false,
  reasoning: "1 of 2 checks failed.",
  issues: [
    {
      priority: "minor",
      category: "missing-element",
      description: "No parrot icon found.",
      suggestion: "Add a parrot icon to the header.",
    },
  ],
  statements: [
    {
      statement: "The page has a logo",
      pass: true,
      reasoning: "Logo visible in header",
      confidence: "high",
    },
    {
      statement: "A parrot icon is visible",
      pass: false,
      reasoning: "No parrot icon found in header",
      confidence: "high",
    },
  ],
};

const passingCompare: CompareResult = {
  pass: true,
  reasoning: "No significant changes detected.",
  changes: [],
};

const failingCompare: CompareResult = {
  pass: false,
  reasoning: "Visual differences detected.",
  changes: [
    { severity: "critical", description: "Header layout shifted by 20px" },
    { severity: "minor", description: "Shadow difference on card" },
  ],
};

describe("formatCheckResult", () => {
  it("formats a passing result", () => {
    const output = formatCheckResult(passingCheck);
    expect(output).toContain("Visual AI Check Passed");
    expect(output).toContain("All checks passed.");
  });

  it("formats a passing result with label", () => {
    const output = formatCheckResult(passingCheck, "homepage");
    expect(output).toContain("Visual AI Check Passed (homepage)");
  });

  it("formats a failing result with statements and issues", () => {
    const output = formatCheckResult(failingCheck);
    expect(output).toContain("Visual AI Check Failed");
    expect(output).toContain("1 of 2 checks failed.");
    expect(output).toContain('PASS  "The page has a logo"');
    expect(output).toContain('FAIL  "A parrot icon is visible"');
    expect(output).toContain("No parrot icon found in header");
    expect(output).toContain("(high)");
    expect(output).toContain("[minor/missing-element] No parrot icon found.");
    expect(output).toContain("→ Add a parrot icon to the header.");
  });

  it("formats a failing result with label", () => {
    const output = formatCheckResult(failingCheck, "betrivers");
    expect(output).toContain("Visual AI Check Failed (betrivers)");
  });

  it("handles statements without confidence", () => {
    const result: CheckResult = {
      pass: false,
      reasoning: "Failed.",
      issues: [],
      statements: [{ statement: "Test", pass: false, reasoning: "Not found" }],
    };
    const output = formatCheckResult(result);
    expect(output).toContain('FAIL  "Test"');
    expect(output).toContain("Not found");
    expect(output).not.toContain("(high)");
    expect(output).not.toContain("(undefined)");
  });

  it("omits issues section when empty", () => {
    const result: CheckResult = {
      pass: false,
      reasoning: "Failed.",
      issues: [],
      statements: [{ statement: "Test", pass: false, reasoning: "Not found" }],
    };
    const output = formatCheckResult(result);
    expect(output).not.toContain("Issues:");
  });
});

describe("formatCompareResult", () => {
  it("formats a passing result", () => {
    const output = formatCompareResult(passingCompare);
    expect(output).toContain("Visual AI Compare Passed");
    expect(output).toContain("No significant changes detected.");
  });

  it("formats a failing result with changes", () => {
    const output = formatCompareResult(failingCompare);
    expect(output).toContain("Visual AI Compare Failed");
    expect(output).toContain("Visual differences detected.");
    expect(output).toContain("[critical] Header layout shifted by 20px");
    expect(output).toContain("[minor] Shadow difference on card");
  });

  it("formats with label", () => {
    const output = formatCompareResult(failingCompare, "before-after");
    expect(output).toContain("Visual AI Compare Failed (before-after)");
  });

  it("includes diff image summary when diffImage is present", () => {
    const resultWithDiff: CompareResult = {
      ...failingCompare,
      diffImage: {
        data: Buffer.alloc(0),
        width: 800,
        height: 600,
        mimeType: "image/png",
      },
    };
    const output = formatCompareResult(resultWithDiff);
    expect(output).toContain("Diff image: 800x600 (AI-generated)");
  });

  it("omits diff image summary when diffImage is not present", () => {
    const output = formatCompareResult(failingCompare);
    expect(output).not.toContain("Diff image:");
  });
});

describe("assertVisualResult", () => {
  it("does not throw on passing result", () => {
    expect(() => {
      assertVisualResult(passingCheck);
    }).not.toThrow();
  });

  it("throws VisualAIAssertionError on failing result", () => {
    expect(() => {
      assertVisualResult(failingCheck);
    }).toThrow(VisualAIAssertionError);
  });

  it("error message contains formatted output", () => {
    try {
      assertVisualResult(failingCheck);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(VisualAIAssertionError);
      const error = err as VisualAIAssertionError;
      expect(error.message).toContain("Visual AI Check Failed");
      expect(error.message).toContain('FAIL  "A parrot icon is visible"');
      expect(error.result).toBe(failingCheck);
    }
  });

  it("passes label through to formatted message", () => {
    try {
      assertVisualResult(failingCheck, "my-test");
      expect.unreachable("should have thrown");
    } catch (err) {
      const error = err as VisualAIAssertionError;
      expect(error.message).toContain("Visual AI Check Failed (my-test)");
    }
  });
});

describe("assertVisualCompareResult", () => {
  it("does not throw on passing result", () => {
    expect(() => {
      assertVisualCompareResult(passingCompare);
    }).not.toThrow();
  });

  it("throws VisualAIAssertionError on failing result", () => {
    expect(() => {
      assertVisualCompareResult(failingCompare);
    }).toThrow(VisualAIAssertionError);
  });

  it("error carries the original result", () => {
    try {
      assertVisualCompareResult(failingCompare);
      expect.unreachable("should have thrown");
    } catch (err) {
      const error = err as VisualAIAssertionError;
      expect(error.message).toContain("Visual AI Compare Failed");
      expect(error.message).toContain("[critical] Header layout shifted by 20px");
      expect(error.result).toBe(failingCompare);
    }
  });
});
