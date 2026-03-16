import { describe, it, expect } from "vitest";
import {
  IssuePrioritySchema,
  IssueCategorySchema,
  IssueSchema,
  StatementResultSchema,
  ConfidenceSchema,
  CheckResultSchema,
  CompareResultSchema,
  ChangeEntrySchema,
  AskResultSchema,
  UsageInfoSchema,
} from "../src/types.js";

describe("IssuePrioritySchema", () => {
  it("accepts valid priorities", () => {
    expect(IssuePrioritySchema.parse("critical")).toBe("critical");
    expect(IssuePrioritySchema.parse("major")).toBe("major");
    expect(IssuePrioritySchema.parse("minor")).toBe("minor");
  });

  it("rejects invalid priorities", () => {
    expect(() => IssuePrioritySchema.parse("high")).toThrow();
    expect(() => IssuePrioritySchema.parse("")).toThrow();
    expect(() => IssuePrioritySchema.parse(123)).toThrow();
  });
});

describe("IssueCategorySchema", () => {
  it("accepts all valid categories", () => {
    const categories = [
      "accessibility",
      "missing-element",
      "layout",
      "content",
      "styling",
      "functionality",
      "performance",
      "other",
    ];
    for (const cat of categories) {
      expect(IssueCategorySchema.parse(cat)).toBe(cat);
    }
  });

  it("rejects invalid categories", () => {
    expect(() => IssueCategorySchema.parse("unknown")).toThrow();
  });
});

describe("IssueSchema", () => {
  it("accepts a valid issue", () => {
    const issue = {
      priority: "critical",
      category: "accessibility",
      description: "Low contrast text",
      suggestion: "Increase contrast ratio",
    };
    expect(IssueSchema.parse(issue)).toEqual(issue);
  });

  it("rejects issue with missing fields", () => {
    expect(() => IssueSchema.parse({ priority: "critical" })).toThrow();
    expect(() => IssueSchema.parse({ priority: "critical", category: "layout" })).toThrow();
  });

  it("rejects issue with invalid priority", () => {
    expect(() =>
      IssueSchema.parse({
        priority: "high",
        category: "layout",
        description: "test",
        suggestion: "test",
      }),
    ).toThrow();
  });
});

describe("ConfidenceSchema", () => {
  it("accepts valid confidence levels", () => {
    expect(ConfidenceSchema.parse("high")).toBe("high");
    expect(ConfidenceSchema.parse("medium")).toBe("medium");
    expect(ConfidenceSchema.parse("low")).toBe("low");
  });

  it("rejects invalid confidence values", () => {
    expect(() => ConfidenceSchema.parse("very-high")).toThrow();
    expect(() => ConfidenceSchema.parse("")).toThrow();
    expect(() => ConfidenceSchema.parse(0.9)).toThrow();
  });
});

describe("StatementResultSchema", () => {
  it("accepts a valid statement result without confidence", () => {
    const result = {
      statement: "Button is visible",
      pass: true,
      reasoning: "Button found at center of form",
    };
    expect(StatementResultSchema.parse(result)).toEqual(result);
  });

  it("accepts a valid statement result with confidence", () => {
    const result = {
      statement: "Button is visible",
      pass: true,
      reasoning: "Button found at center of form",
      confidence: "high" as const,
    };
    expect(StatementResultSchema.parse(result)).toEqual(result);
  });

  it("accepts all confidence levels", () => {
    for (const level of ["high", "medium", "low"]) {
      const result = StatementResultSchema.parse({
        statement: "test",
        pass: true,
        reasoning: "test",
        confidence: level,
      });
      expect(result.confidence).toBe(level);
    }
  });

  it("rejects invalid confidence value", () => {
    expect(() =>
      StatementResultSchema.parse({
        statement: "test",
        pass: true,
        reasoning: "test",
        confidence: "very-high",
      }),
    ).toThrow();
  });

  it("rejects missing fields", () => {
    expect(() => StatementResultSchema.parse({ statement: "test" })).toThrow();
  });
});

describe("UsageInfoSchema", () => {
  it("accepts usage without estimatedCost", () => {
    const usage = { inputTokens: 100, outputTokens: 50 };
    expect(UsageInfoSchema.parse(usage)).toEqual(usage);
  });

  it("accepts usage with estimatedCost", () => {
    const usage = { inputTokens: 100, outputTokens: 50, estimatedCost: 0.0105 };
    expect(UsageInfoSchema.parse(usage)).toEqual(usage);
  });

  it("accepts usage with durationSeconds", () => {
    const usage = { inputTokens: 100, outputTokens: 50, durationSeconds: 1.234 };
    expect(UsageInfoSchema.parse(usage)).toEqual(usage);
  });

  it("accepts usage with both estimatedCost and durationSeconds", () => {
    const usage = { inputTokens: 100, outputTokens: 50, estimatedCost: 0.01, durationSeconds: 2.5 };
    expect(UsageInfoSchema.parse(usage)).toEqual(usage);
  });

  it("accepts durationSeconds of zero", () => {
    const usage = { inputTokens: 100, outputTokens: 50, durationSeconds: 0 };
    expect(UsageInfoSchema.parse(usage)).toEqual(usage);
  });

  it("rejects negative durationSeconds", () => {
    expect(() =>
      UsageInfoSchema.parse({ inputTokens: 100, outputTokens: 50, durationSeconds: -1 }),
    ).toThrow();
  });

  it("rejects missing token fields", () => {
    expect(() => UsageInfoSchema.parse({ inputTokens: 100 })).toThrow();
    expect(() => UsageInfoSchema.parse({ outputTokens: 50 })).toThrow();
  });
});

describe("CheckResultSchema", () => {
  it("accepts a valid check result", () => {
    const result = {
      pass: true,
      reasoning: "All checks passed",
      issues: [],
      statements: [{ statement: "Button visible", pass: true, reasoning: "Found it" }],
    };
    expect(CheckResultSchema.parse(result)).toEqual(result);
  });

  it("accepts check result with confidence on statements", () => {
    const result = {
      pass: true,
      reasoning: "All checks passed",
      issues: [],
      statements: [
        { statement: "Button visible", pass: true, reasoning: "Found it", confidence: "high" },
      ],
    };
    expect(CheckResultSchema.parse(result)).toEqual(result);
  });

  it("accepts check result with usage", () => {
    const result = {
      pass: false,
      reasoning: "1 of 2 checks failed",
      issues: [
        {
          priority: "major" as const,
          category: "missing-element" as const,
          description: "Missing button",
          suggestion: "Add button",
        },
      ],
      statements: [
        { statement: "Button visible", pass: false, reasoning: "Not found" },
        { statement: "Header exists", pass: true, reasoning: "Found it" },
      ],
      usage: { inputTokens: 100, outputTokens: 50 },
    };
    expect(CheckResultSchema.parse(result)).toEqual(result);
  });

  it("accepts check result with usage including estimatedCost", () => {
    const result = {
      pass: true,
      reasoning: "All checks passed",
      issues: [],
      statements: [{ statement: "Button visible", pass: true, reasoning: "Found it" }],
      usage: { inputTokens: 100, outputTokens: 50, estimatedCost: 0.0105 },
    };
    expect(CheckResultSchema.parse(result)).toEqual(result);
  });

  it("rejects missing pass field", () => {
    expect(() =>
      CheckResultSchema.parse({
        reasoning: "test",
        issues: [],
        statements: [],
      }),
    ).toThrow();
  });

  it("strips unknown fields", () => {
    const result = CheckResultSchema.parse({
      pass: true,
      reasoning: "ok",
      issues: [],
      statements: [],
      extraField: "should be stripped",
    });
    expect(result).not.toHaveProperty("extraField");
  });
});

describe("ChangeEntrySchema", () => {
  it("accepts a valid change entry", () => {
    const entry = { description: "Button was removed", severity: "critical" };
    expect(ChangeEntrySchema.parse(entry)).toEqual(entry);
  });

  it("accepts all severity levels", () => {
    for (const severity of ["critical", "major", "minor"]) {
      expect(ChangeEntrySchema.parse({ description: "test", severity })).toEqual({
        description: "test",
        severity,
      });
    }
  });

  it("rejects invalid severity", () => {
    expect(() => ChangeEntrySchema.parse({ description: "test", severity: "high" })).toThrow();
  });

  it("rejects missing fields", () => {
    expect(() => ChangeEntrySchema.parse({ description: "test" })).toThrow();
    expect(() => ChangeEntrySchema.parse({ severity: "major" })).toThrow();
  });
});

describe("CompareResultSchema", () => {
  it("accepts a valid compare result with changes", () => {
    const result = {
      pass: false,
      reasoning: "2 changes detected",
      changes: [
        { description: "Button removed", severity: "critical" },
        { description: "Color changed", severity: "minor" },
      ],
    };
    expect(CompareResultSchema.parse(result)).toEqual(result);
  });

  it("accepts compare result with empty changes", () => {
    const result = {
      pass: true,
      reasoning: "Images are identical",
      changes: [],
    };
    expect(CompareResultSchema.parse(result)).toEqual(result);
  });

  it("accepts compare result with usage", () => {
    const result = {
      pass: true,
      reasoning: "No changes",
      changes: [],
      usage: { inputTokens: 500, outputTokens: 200 },
    };
    expect(CompareResultSchema.parse(result)).toEqual(result);
  });

  it("rejects changes array exceeding max 50", () => {
    const changes = Array.from({ length: 51 }, (_, i) => ({
      description: `Change ${i}`,
      severity: "minor",
    }));
    expect(() =>
      CompareResultSchema.parse({
        pass: false,
        reasoning: "too many",
        changes,
      }),
    ).toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() => CompareResultSchema.parse({ pass: true, reasoning: "ok" })).toThrow();
  });
});

describe("AskResultSchema", () => {
  it("accepts a valid ask result", () => {
    const result = {
      summary: "Found 2 issues",
      issues: [
        {
          priority: "critical" as const,
          category: "accessibility" as const,
          description: "Low contrast",
          suggestion: "Increase contrast",
        },
      ],
    };
    expect(AskResultSchema.parse(result)).toEqual(result);
  });

  it("accepts ask result with usage", () => {
    const result = {
      summary: "No issues found",
      issues: [],
      usage: { inputTokens: 200, outputTokens: 100 },
    };
    expect(AskResultSchema.parse(result)).toEqual(result);
  });

  it("rejects missing summary", () => {
    expect(() => AskResultSchema.parse({ issues: [] })).toThrow();
  });
});
