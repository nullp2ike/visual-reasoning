---
title: "refactor: Switch Gemini thinking config from thinkingBudget to thinkingLevel"
type: refactor
status: active
date: 2026-03-19
---

# refactor: Switch Gemini thinking config from thinkingBudget to thinkingLevel

## Overview

Google's Gemini API now recommends `thinkingLevel` (string-based levels) over `thinkingBudget` (numeric token counts) for controlling reasoning depth. Using `thinkingBudget` with Gemini 3 models "may result in unexpected performance." This change switches the Google provider to use `thinkingLevel`.

## Proposed Solution

Replace the numeric `GOOGLE_THINKING_BUDGET` mapping with a string-based `GOOGLE_THINKING_LEVEL` mapping and update the API call parameter from `thinkingBudget` to `thinkingLevel`.

**Mapping:**

| `ReasoningEffort` | Current (`thinkingBudget`) | New (`thinkingLevel`) |
| ----------------- | -------------------------- | --------------------- |
| `low`             | `1024`                     | `"minimal"`           |
| `medium`          | `8192`                     | `"low"`               |
| `high`            | `24576`                    | `"medium"`            |
| `xhigh`           | `24576`                    | `"high"`              |

No backwards compatibility with `thinkingBudget` will be maintained.

## Acceptance Criteria

- [ ] `GOOGLE_THINKING_BUDGET` constant replaced with `GOOGLE_THINKING_LEVEL: Record<ReasoningEffort, string>` in `src/providers/google.ts`
- [ ] API call sends `thinkingConfig: { thinkingLevel: "..." }` instead of `thinkingConfig: { thinkingBudget: ... }`
- [ ] Tests in `tests/providers/google.test.ts` updated to assert `thinkingLevel` string values
- [ ] All checks pass: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

## MVP

### src/providers/google.ts

```typescript
// Replace the constant (lines 59-64)

// Before:
const GOOGLE_THINKING_BUDGET: Record<ReasoningEffort, number> = {
  low: 1024,
  medium: 8192,
  high: 24576,
  xhigh: 24576,
};

// After:
const GOOGLE_THINKING_LEVEL: Record<ReasoningEffort, string> = {
  low: "minimal",
  medium: "low",
  high: "medium",
  xhigh: "high",
};
```

```typescript
// Update the API call (lines 121-125)

// Before:
...(this.reasoningEffort && {
  thinkingConfig: {
    thinkingBudget: GOOGLE_THINKING_BUDGET[this.reasoningEffort],
  },
}),

// After:
...(this.reasoningEffort && {
  thinkingConfig: {
    thinkingLevel: GOOGLE_THINKING_LEVEL[this.reasoningEffort],
  },
}),
```

### tests/providers/google.test.ts

```typescript
// Update test assertion (line 98)
// Before:
expect(config).toHaveProperty("thinkingConfig", { thinkingBudget: 8192 });
// After:
expect(config).toHaveProperty("thinkingConfig", { thinkingLevel: "low" });

// Update budget mapping test (lines 101-121)
// Change expectedBudgets to expectedLevels with string values:
const expectedLevels: Record<string, string> = {
  low: "minimal",
  medium: "low",
  high: "medium",
  xhigh: "high",
};
// And assert thinkingLevel instead of thinkingBudget
```

## Sources

- Gemini API Thinking docs: https://ai.google.dev/gemini-api/docs/thinking
- `thinkingLevel` valid values: `"minimal"`, `"low"`, `"medium"`, `"high"`
