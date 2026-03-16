---
status: complete
priority: p1
issue_id: "001"
tags: [code-review, architecture, data-loss]
dependencies: []
---

# Diff failure discards successful AI comparison result

## Problem Statement

When `generatePixelDiff` or `generateAiDiff` throws an error, the entire `compare()` call rejects — discarding the successful AI comparison result. The plan (D5) explicitly states: "If diff generation fails but the AI comparison succeeded, return the CompareResult without diffImage."

This is a data-loss bug: a missing `pixelmatch` peer dep or a Gemini API error would destroy a valid comparison result.

## Findings

**Architecture Strategist**: The `Promise.all([aiCall, pixelDiffCall])` at `src/core/client.ts:226` propagates pixel diff rejections, losing the resolved AI result. The sequential `generateAiDiff` call (line 231) also has no try/catch.

**Agent-Native Reviewer**: Confirmed as highest-impact finding — silent data loss in a testing library.

## Proposed Solutions

### Option A: Wrap diff calls with `.catch()` and `debugLog` (Recommended)

```typescript
const [response, pixelDiffResult] = await Promise.all([
  aiCall,
  pixelDiffCall.catch((err) => {
    debugLog(config, "diff error", String(err));
    return undefined;
  }),
]);

let diffResult = pixelDiffResult;
if (!diffResult && options?.diffImage?.method === "ai") {
  try {
    diffResult = await generateAiDiff(imgA, imgB, options.diffImage, driver);
  } catch (err) {
    debugLog(config, "ai diff error", String(err));
  }
}
```

- **Effort**: Small
- **Risk**: Low — error is logged via debugLog, not silently swallowed

## Acceptance Criteria

- [ ] `compare()` returns AI result even when pixel diff throws
- [ ] `compare()` returns AI result even when AI diff throws
- [ ] Diff errors are logged via `debugLog`
- [ ] Update existing test "propagates diff generation errors" to verify graceful degradation
- [ ] Add test: compare with `method: "pixel"` when pixelmatch not installed → returns result without diffImage

## Work Log

| Date       | Action                   |
| ---------- | ------------------------ |
| 2026-03-10 | Created from code review |
