---
status: complete
priority: p3
issue_id: "009"
tags: [code-review, testing]
dependencies: []
---

# Add format test for AI-generated diff (no pixel stats)

## Problem Statement

`formatCompareResult` has two branches at `src/format.ts:48-56`: one for pixel diffs (with stats) and one for AI diffs (shows "(AI-generated)"). The test at `tests/format.test.ts:142` only covers the pixel stats branch. No test verifies the `"(AI-generated)"` label.

## Findings

**TypeScript Reviewer**: Missing test for the AI-generated format branch.

## Proposed Solutions

### Option A: Add test case (Recommended)

```typescript
it("shows AI-generated label when diffPixels/totalPixels are undefined", () => {
  const resultWithAiDiff: CompareResult = {
    ...failingCompare,
    diffImage: {
      data: Buffer.alloc(0),
      width: 800,
      height: 600,
      mimeType: "image/png",
    },
  };
  const output = formatCompareResult(resultWithAiDiff);
  expect(output).toContain("Diff image: 800x600 (AI-generated)");
});
```

- Effort: Trivial

## Work Log

| Date       | Action                   |
| ---------- | ------------------------ |
| 2026-03-10 | Created from code review |
