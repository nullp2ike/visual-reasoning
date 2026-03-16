---
status: complete
priority: p3
issue_id: "010"
tags: [code-review, simplicity]
dependencies: []
---

# Remove cached pixelmatchPromise pattern

## Problem Statement

The module-level `let pixelmatchPromise` with cache-invalidation-on-error at `src/core/diff.ts:18-30` adds cognitive load (mutable state, retry semantics) for negligible performance benefit. Dynamic `import()` is fast and cached by Node.js itself.

## Findings

**Simplicity Reviewer**: Replace with a plain async function. Saves ~6 lines and eliminates mutable module state.

```typescript
async function loadPixelmatch(): Promise<PixelmatchFn> {
  try {
    const mod: unknown = await import("pixelmatch");
    return (mod as { default: PixelmatchFn }).default;
  } catch {
    throw new VisualAIConfigError("pixelmatch not installed. Run: npm install pixelmatch");
  }
}
```

## Work Log

| Date       | Action                   |
| ---------- | ------------------------ |
| 2026-03-10 | Created from code review |
