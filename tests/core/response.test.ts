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
