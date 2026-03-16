---
status: complete
priority: p2
issue_id: "004"
tags: [code-review, agent-native, error-handling]
dependencies: []
---

# Silent failure on unknown diff method

## Problem Statement

If `diffImage.method` is not `"pixel"` or `"ai"`, `compare()` silently produces no diff and no error. This violates the project's "errors over silent failures" principle.

TypeScript catches this at compile time, but at runtime (e.g., from JavaScript consumers or dynamic config) the method value could be anything.

## Findings

**Agent-Native Reviewer**: An agent passing an unsupported method gets no diff and no error — a silent failure. Rated as must-fix for agent accessibility.

## Proposed Solutions

### Option A: Add exhaustive check in compare() (Recommended)

```typescript
if (options?.diffImage && !diffResult) {
  throw new VisualAIConfigError(
    `Unsupported diffImage method: "${(options.diffImage as { method: string }).method}". Supported: "pixel", "ai"`,
  );
}
```

- Effort: Small
- Risk: None — this is a new error for an impossible-in-TypeScript but possible-in-JavaScript case

## Acceptance Criteria

- [ ] Unknown diff method throws `VisualAIConfigError` with helpful message
- [ ] Test added for unknown method case

## Work Log

| Date       | Action                   |
| ---------- | ------------------------ |
| 2026-03-10 | Created from code review |
