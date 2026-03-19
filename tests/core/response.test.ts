import { describe, it, expect } from "vitest";
import {
  parseAskResponse,
  parseCheckResponse,
  parseCompareResponse,
} from "../../src/core/response.js";
import { VisualAIResponseParseError } from "../../src/errors.js";

describe("parseCheckResponse", () => {
  it("parses valid check result", () => {
    const json = JSON.stringify({
      pass: true,
      reasoning: "All checks passed",
      issues: [],
      statements: [{ statement: "Button visible", pass: true, reasoning: "Found it" }],
    });

    const result = parseCheckResponse(json);
    expect(result.pass).toBe(true);
    expect(result.reasoning).toBe("1 of 1 checks passed. All checks passed");
    expect(result.statements).toHaveLength(1);
    expect(result.issues).toHaveLength(0);
  });

  it("parses check result with confidence field", () => {
    const json = JSON.stringify({
      pass: true,
      reasoning: "All checks passed",
      issues: [],
      statements: [
        {
          statement: "Button visible",
          pass: true,
          reasoning: "Found it",
          confidence: "high",
        },
      ],
    });

    const result = parseCheckResponse(json);
    expect(result.statements[0]!.confidence).toBe("high");
  });

  it("parses check result without confidence field", () => {
    const json = JSON.stringify({
      pass: true,
      reasoning: "All checks passed",
      issues: [],
      statements: [{ statement: "Button visible", pass: true, reasoning: "Found it" }],
    });

    const result = parseCheckResponse(json);
    expect(result.statements[0]!.confidence).toBeUndefined();
  });

  it("parses check result with issues", () => {
    const json = JSON.stringify({
      pass: false,
      reasoning: "1 check failed",
      issues: [
        {
          priority: "major",
          category: "missing-element",
          description: "Button not found",
          suggestion: "Add button",
        },
      ],
      statements: [{ statement: "Button visible", pass: false, reasoning: "Not found" }],
    });

    const result = parseCheckResponse(json);
    expect(result.pass).toBe(false);
    expect(result.reasoning).toBe("0 of 1 checks passed. 1 check failed");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.priority).toBe("major");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseCheckResponse("not json")).toThrow(VisualAIResponseParseError);
  });

  it("throws on missing required fields", () => {
    expect(() => parseCheckResponse(JSON.stringify({ pass: true }))).toThrow(
      VisualAIResponseParseError,
    );
  });

  it("includes raw response in error", () => {
    try {
      parseCheckResponse("bad json");
    } catch (err) {
      expect(err).toBeInstanceOf(VisualAIResponseParseError);
      expect((err as VisualAIResponseParseError).rawResponse).toBe("bad json");
    }
  });

  it("strips unknown fields", () => {
    const json = JSON.stringify({
      pass: true,
      reasoning: "ok",
      issues: [],
      statements: [],
      extraField: "should be ignored",
    });

    const result = parseCheckResponse(json);
    expect(result).not.toHaveProperty("extraField");
  });

  describe("result consistency enforcement", () => {
    it("overrides pass to false when any statement fails", () => {
      const raw = JSON.stringify({
        pass: true,
        reasoning: "All checks passed",
        issues: [],
        statements: [
          { statement: "Header visible", pass: true, reasoning: "Visible", confidence: "high" },
          { statement: "Button visible", pass: false, reasoning: "Not found", confidence: "high" },
        ],
      });
      const result = parseCheckResponse(raw);
      expect(result.pass).toBe(false);
      expect(result.reasoning).toMatch(/^1 of 2 checks passed/);
    });

    it("overrides pass to true when all statements pass", () => {
      const raw = JSON.stringify({
        pass: false,
        reasoning: "1 of 2 checks failed",
        issues: [],
        statements: [
          { statement: "Header visible", pass: true, reasoning: "Visible", confidence: "high" },
          { statement: "Button visible", pass: true, reasoning: "Visible", confidence: "high" },
        ],
      });
      const result = parseCheckResponse(raw);
      expect(result.pass).toBe(true);
      expect(result.reasoning).toMatch(/^2 of 2 checks passed/);
    });

    it("adds count prefix even when model pass is consistent", () => {
      const raw = JSON.stringify({
        pass: true,
        reasoning: "Everything looks good",
        issues: [],
        statements: [
          { statement: "Header visible", pass: true, reasoning: "Visible", confidence: "high" },
        ],
      });
      const result = parseCheckResponse(raw);
      expect(result.pass).toBe(true);
      expect(result.reasoning).toMatch(/^1 of 1 checks passed/);
      expect(result.reasoning).toContain("Everything looks good");
    });

    it("preserves model reasoning after count prefix", () => {
      const raw = JSON.stringify({
        pass: false,
        reasoning: "The submit button is hidden behind a modal overlay",
        issues: [
          {
            priority: "major",
            category: "missing-element",
            description: "Button hidden",
            suggestion: "Fix z-index",
          },
        ],
        statements: [
          { statement: "Header visible", pass: true, reasoning: "Visible", confidence: "high" },
          {
            statement: "Button visible",
            pass: false,
            reasoning: "Hidden by modal",
            confidence: "high",
          },
          { statement: "Footer visible", pass: true, reasoning: "Visible", confidence: "high" },
        ],
      });
      const result = parseCheckResponse(raw);
      expect(result.pass).toBe(false);
      expect(result.reasoning).toBe(
        "2 of 3 checks passed. The submit button is hidden behind a modal overlay",
      );
    });

    it("preserves model pass when statements array is empty", () => {
      const raw = JSON.stringify({
        pass: false,
        reasoning: "Could not evaluate",
        issues: [],
        statements: [],
      });
      const result = parseCheckResponse(raw);
      expect(result.pass).toBe(false);
      expect(result.reasoning).toBe("Could not evaluate");
    });

    it("handles all statements failing", () => {
      const raw = JSON.stringify({
        pass: false,
        reasoning: "Nothing passed",
        issues: [],
        statements: [
          { statement: "A", pass: false, reasoning: "Failed", confidence: "high" },
          { statement: "B", pass: false, reasoning: "Failed", confidence: "high" },
        ],
      });
      const result = parseCheckResponse(raw);
      expect(result.pass).toBe(false);
      expect(result.reasoning).toMatch(/^0 of 2 checks passed/);
    });
  });
});

describe("parseAskResponse", () => {
  it("parses valid query result", () => {
    const json = JSON.stringify({
      summary: "Found 1 issue",
      issues: [
        {
          priority: "critical",
          category: "accessibility",
          description: "Low contrast",
          suggestion: "Fix contrast",
        },
      ],
    });

    const result = parseAskResponse(json);
    expect(result.summary).toBe("Found 1 issue");
    expect(result.issues).toHaveLength(1);
  });

  it("parses query result with empty issues", () => {
    const json = JSON.stringify({
      summary: "No issues found",
      issues: [],
    });

    const result = parseAskResponse(json);
    expect(result.summary).toBe("No issues found");
    expect(result.issues).toHaveLength(0);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseAskResponse("{invalid")).toThrow(VisualAIResponseParseError);
  });

  it("throws on missing summary", () => {
    expect(() => parseAskResponse(JSON.stringify({ issues: [] }))).toThrow(
      VisualAIResponseParseError,
    );
  });
});

describe("parseCompareResponse", () => {
  it("parses valid compare result", () => {
    const json = JSON.stringify({
      pass: false,
      reasoning: "2 changes detected",
      changes: [
        { description: "Button removed", severity: "critical" },
        { description: "Color changed", severity: "minor" },
      ],
    });

    const result = parseCompareResponse(json);
    expect(result.pass).toBe(false);
    expect(result.changes).toHaveLength(2);
    expect(result.changes[0]!.severity).toBe("critical");
  });

  it("parses compare result with empty changes", () => {
    const json = JSON.stringify({
      pass: true,
      reasoning: "Images are identical",
      changes: [],
    });

    const result = parseCompareResponse(json);
    expect(result.pass).toBe(true);
    expect(result.changes).toHaveLength(0);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseCompareResponse("not json")).toThrow(VisualAIResponseParseError);
  });

  it("throws on missing required fields", () => {
    expect(() => parseCompareResponse(JSON.stringify({ pass: true, reasoning: "ok" }))).toThrow(
      VisualAIResponseParseError,
    );
  });

  it("strips code fences from response", () => {
    const json = JSON.stringify({
      pass: true,
      reasoning: "No changes",
      changes: [],
    });
    const wrapped = "```json\n" + json + "\n```";

    const result = parseCompareResponse(wrapped);
    expect(result.pass).toBe(true);
  });
});
