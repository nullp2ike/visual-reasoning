---
title: "Migrate Gemini provider from thinkingBudget to thinkingLevel for Gemini 3+ compatibility"
category: integration-issues
date: 2026-03-19
tags:
  - google
  - gemini
  - thinking-config
  - api-migration
  - provider-driver
  - reasoning-effort
severity: medium
component: src/providers/google.ts
symptoms:
  - "Unexpected or degraded reasoning performance with Gemini 3+ models"
  - "thinkingBudget parameter ignored or producing inconsistent results on newer Gemini models"
---

# Migrate Gemini Provider from `thinkingBudget` to `thinkingLevel`

## Problem

The Google Gemini provider was using the `thinkingBudget` parameter (numeric token counts) to configure thinking depth in API calls. Google's documentation for Gemini 3+ models recommends `thinkingLevel` (string-based levels) instead, warning that using `thinkingBudget` with Gemini 3 "may result in unexpected performance."

## Root Cause

The library was originally implemented against Gemini 2.5 API conventions, which used numeric `thinkingBudget` values. When Gemini 3+ models were released, they introduced `thinkingLevel` as the recommended approach with four string-based levels: `"minimal"`, `"low"`, `"medium"`, `"high"`.

## Solution

### 1. Replace the numeric budget mapping with string thinking levels

```typescript
// BEFORE
const GOOGLE_THINKING_BUDGET: Record<ReasoningEffort, number> = {
  low: 1024,
  medium: 8192,
  high: 24576,
  xhigh: 24576,
};

// AFTER
const GOOGLE_THINKING_LEVEL = {
  low: "minimal",
  medium: "low",
  high: "medium",
  xhigh: "high",
} as const satisfies Record<ReasoningEffort, string>;
```

### 2. Update the API call parameter

```typescript
// BEFORE
thinkingConfig: {
  thinkingBudget: GOOGLE_THINKING_BUDGET[this.reasoningEffort];
}

// AFTER
thinkingConfig: {
  thinkingLevel: GOOGLE_THINKING_LEVEL[this.reasoningEffort];
}
```

### 3. Update tests to assert string values instead of numeric budgets

Tests in `tests/providers/google.test.ts` and `tests/core/client.test.ts` were updated to assert `thinkingLevel` with the mapped string values.

## Key Design Decisions

1. **Offset-by-one mapping**: The library's `ReasoningEffort` scale (`low`/`medium`/`high`/`xhigh`) is shifted one level above Gemini's `thinkingLevel` scale (`minimal`/`low`/`medium`/`high`). This uses the full range of both scales instead of collapsing two levels into one (the old mapping had `high` and `xhigh` both at `24576`).

2. **`as const satisfies` pattern**: Provides literal type inference on values while maintaining exhaustiveness checking on keys — better type safety than `Record<ReasoningEffort, string>` without needing a separate type declaration.

3. **No backwards compatibility**: Clean switch to `thinkingLevel` only. No feature flag or fallback to `thinkingBudget`.

## Cross-Provider Comparison

| `ReasoningEffort` | Google `thinkingLevel` | Anthropic `effort` | OpenAI `effort` |
| ----------------- | ---------------------- | ------------------ | --------------- |
| `low`             | `"minimal"`            | `"low"`            | `"low"`         |
| `medium`          | `"low"`                | `"medium"`         | `"medium"`      |
| `high`            | `"medium"`             | `"high"`           | `"high"`        |
| `xhigh`           | `"high"`               | `"max"`            | `"xhigh"`       |

## Prevention

- **Assert config shape in tests**: Mock the SDK and assert the config object contains expected keys (`thinkingLevel`) and does NOT contain deprecated keys (`thinkingBudget`). The library already does this.
- **Review provider SDK changelogs on update**: When bumping `@google/genai`, `@anthropic-ai/sdk`, or `openai` packages, check for deprecation notices and API parameter changes.
- **Provider documentation links**: Keep reference docs bookmarked for each provider's thinking/reasoning API:
  - Google: https://ai.google.dev/gemini-api/docs/thinking
  - Anthropic: https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking
  - OpenAI: https://developers.openai.com/api/docs/guides/reasoning

## Related Files

- Plan: `docs/plans/2026-03-19-004-refactor-gemini-thinking-level-plan.md`
- Implementation: `src/providers/google.ts` (lines 59-64, 121-125)
- Tests: `tests/providers/google.test.ts`, `tests/core/client.test.ts`
