---
status: complete
priority: p3
issue_id: "008"
tags: [code-review, quality, documentation]
dependencies: []
---

# Add comment explaining CompareResult/Zod schema divergence

## Problem Statement

`CompareResult` is `z.infer<typeof CompareResultSchema> & { diffImage?: DiffImageResult }` at `src/types.ts:78`. The Zod schema doesn't know about `diffImage`, so `CompareResultSchema.parse()` would strip it. This is intentional (diffImage is locally computed, not parsed from AI) but undocumented.

## Findings

**TypeScript Reviewer**: Needs a comment explaining the design intent to prevent future contributors from "fixing" the divergence.

**Agent-Native Reviewer**: Consumers using Zod validation could lose diffImage data.

## Proposed Solutions

### Option A: Add explanatory comment (Recommended)

```typescript
// diffImage is appended client-side after the AI response is parsed,
// so it intentionally does not appear in CompareResultSchema.
export type CompareResult = z.infer<typeof CompareResultSchema> & {
  diffImage?: DiffImageResult;
};
```

- Effort: Trivial

## Work Log

| Date       | Action                   |
| ---------- | ------------------------ |
| 2026-03-10 | Created from code review |
