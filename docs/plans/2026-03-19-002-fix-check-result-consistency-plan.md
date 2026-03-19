---
title: "fix: Enforce consistency between check statement results and summary"
type: fix
status: active
date: 2026-03-19
origin: docs/brainstorms/2026-03-19-check-result-consistency-requirements.md
---

# fix: Enforce consistency between check statement results and summary

## Overview

The AI model sometimes returns a top-level `pass` or `reasoning` that contradicts individual `statements[].pass` values (e.g., 3 passes + 2 failures but reasoning says "4 of 5 passed"). Fix with two prongs: improve the prompt AND add post-processing to enforce consistency. (see origin: docs/brainstorms/2026-03-19-check-result-consistency-requirements.md)

## Problem Statement

`parseCheckResponse()` in `src/core/response.ts` validates structure only — Zod checks types but not cross-field consistency. All 7 check-like methods (`check`, `elementsVisible`, `elementsHidden`, `accessibility`, `layout`, `pageLoad`, `content`) flow through this single function, so the fix is centralized.

## Design Decisions

These decisions were surfaced by spec-flow analysis:

1. **Issues filtering: dropped from scope.** The `Issue` type has no `statementIndex` or reference to which statement it belongs. Fuzzy string matching is fragile. Keep all model-returned issues as-is. (Diverges from R4 in origin doc — adding a linkage field would be a separate schema change.)

2. **Reasoning: preserve model context, prepend accurate count.** Format: `"X of Y checks passed. [model's original reasoning]"`. This keeps the model's qualitative explanation (e.g., "submit button hidden by modal") while ensuring the count is always correct.

3. **Post-processing is authoritative; prompt is best-effort.** The prompt improvement reduces how often overrides fire, but `parseCheckResponse()` is the source of truth for `pass` and the count prefix in `reasoning`.

4. **Empty statements array: preserve model's `pass` value.** The client validates non-empty statements before sending (line 283-285 of `client.ts`), so empty arrays in the response are a model error. Preserve the model's `pass` since there's nothing to compute from. (Statement count mismatch validation is out of scope — worth a follow-up.)

5. **Applies uniformly to all 7 methods.** All flow through `parseCheckResponse()`, no special-casing needed.

6. **`compare()` and `ask()` paths: out of scope.** They have different structures (`changes` array, no `statements`). Can be addressed separately if needed.

7. **No configuration flag.** The fix makes output more correct — backward-incompatible only for users who relied on inconsistent behavior.

## Proposed Solution

### Prong 1: Prompt improvement (`src/core/prompt.ts`)

Strengthen `CHECK_OUTPUT_SCHEMA` to instruct the model to evaluate statements first, then derive the top-level fields. The existing `// true ONLY if ALL statements are true` comment is insufficient — models don't reliably follow schema comments.

### Prong 2: Post-processing (`src/core/response.ts`)

After Zod validation in `parseCheckResponse()`, compute and override:

- `pass` = `statements.every(s => s.pass)` (only when `statements.length > 0`)
- `reasoning` = `"X of Y checks passed. [original reasoning]"` (only when override changes `pass` or count is wrong)

## Acceptance Criteria

- [ ] Top-level `pass` always equals logical AND of `statements[].pass` (when statements non-empty)
- [ ] `reasoning` always starts with accurate "X of Y checks passed" count
- [ ] Model's original reasoning text is preserved after the count prefix
- [ ] All 7 check-like methods benefit from the fix (no code changes needed in client.ts)
- [ ] Prompt instructs model to evaluate statements individually first, then derive summary
- [ ] All existing tests continue to pass
- [ ] New tests cover: consistent model output (no override), inconsistent `pass`, inconsistent count in reasoning, all-pass, all-fail, mixed, single statement

## Implementation Plan

### Phase 1: Tests (`tests/core/response.test.ts`)

Write tests first per project rules.

**New test cases for `parseCheckResponse`:**

```typescript
// tests/core/response.test.ts

// 1. Model returns pass:true but one statement fails → override to pass:false
it("overrides pass to false when any statement fails", () => {
  const raw = JSON.stringify({
    pass: true, // model got this wrong
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

// 2. Model returns pass:false but all statements pass → override to pass:true
it("overrides pass to true when all statements pass", () => {
  const raw = JSON.stringify({
    pass: false, // model got this wrong
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

// 3. Model is consistent → reasoning still gets count prefix
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

// 4. Mixed results with correct count in reasoning
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

// 5. Empty statements → preserve model's pass value
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

// 6. All statements fail
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
```

### Phase 2: Post-processing (`src/core/response.ts`)

Add a `reconcileCheckResult` function called at the end of `parseCheckResponse()`:

```typescript
// src/core/response.ts

function reconcileCheckResult(result: Omit<CheckResult, "usage">): Omit<CheckResult, "usage"> {
  if (result.statements.length === 0) {
    return result;
  }

  const passCount = result.statements.filter((s) => s.pass).length;
  const total = result.statements.length;
  const computedPass = passCount === total;
  const countPrefix = `${passCount} of ${total} checks passed`;
  const reasoning = `${countPrefix}. ${result.reasoning}`;

  return {
    ...result,
    pass: computedPass,
    reasoning,
  };
}

export function parseCheckResponse(raw: string): Omit<CheckResult, "usage"> {
  const result = parseResponse(raw, CheckResponseSchema);
  return reconcileCheckResult(result);
}
```

### Phase 3: Prompt improvement (`src/core/prompt.ts`)

Update `CHECK_OUTPUT_SCHEMA` to add explicit chain-of-thought instructions:

```typescript
const CHECK_OUTPUT_SCHEMA = `
IMPORTANT: Follow this evaluation order:
1. First, evaluate EACH statement independently and populate the "statements" array
2. Then, count how many statements passed and failed
3. Set "pass" to true ONLY if every statement passed (logical AND)
4. Write "reasoning" as a brief summary starting with the count (e.g. "3 of 4 checks passed")
5. Include "issues" only for statements that failed

Respond with a JSON object matching this exact structure:
{
  "pass": boolean,          // true ONLY if ALL statements passed — derive from statements array
  "reasoning": string,      // brief summary starting with count (e.g. "3 of 4 checks passed...")
  "issues": [...],          // one issue per failing statement (empty if all pass)
  "statements": [           // one entry per statement, in order — evaluate these FIRST
    {
      "statement": string,  // the original statement text
      "pass": boolean,      // whether this statement is true
      "reasoning": string,  // explanation for this statement
      "confidence": "high" | "medium" | "low"
    }
  ]
}
...`;
```

## Testing Strategy

1. **Unit tests (Phase 1):** Cover all consistency scenarios in `tests/core/response.test.ts`
2. **Existing tests:** Must continue passing — the `reconcileCheckResult` function will modify existing valid responses by adding a count prefix to `reasoning`, so existing test assertions on exact `reasoning` strings will need updating
3. **Run full check suite:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

## Files to Modify

| File                          | Change                                                          |
| ----------------------------- | --------------------------------------------------------------- |
| `tests/core/response.test.ts` | Add 6+ new test cases for consistency enforcement               |
| `tests/core/response.test.ts` | Update existing test assertions for reasoning format change     |
| `src/core/response.ts`        | Add `reconcileCheckResult()`, update `parseCheckResponse()`     |
| `src/core/prompt.ts`          | Update `CHECK_OUTPUT_SCHEMA` with evaluation order instructions |

## Sources

- **Origin document:** [docs/brainstorms/2026-03-19-check-result-consistency-requirements.md](docs/brainstorms/2026-03-19-check-result-consistency-requirements.md) — key decisions: belt+suspenders approach, post-processing overrides model output
- **Institutional learning:** [docs/solutions/best-practices/composable-prompt-blocks-and-api-consistency.md](docs/solutions/best-practices/composable-prompt-blocks-and-api-consistency.md) — generic prompts cause inconsistent results; domain-specific framing helps
- **Institutional learning:** [docs/solutions/integration-issues/api-integration-bugs-undetectable-by-mocked-tests.md](docs/solutions/integration-issues/api-integration-bugs-undetectable-by-mocked-tests.md) — assert structure not exact AI text; mocked tests can't catch response format issues
