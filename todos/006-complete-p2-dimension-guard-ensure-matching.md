---
status: complete
priority: p2
issue_id: "006"
tags: [code-review, security]
dependencies: []
---

# Add explicit dimension guard in ensureMatchingDimensions

## Problem Statement

`generatePixelDiff` is exported and could be called directly by library consumers who skip `normalizeImage`. Without an explicit max dimension check in `ensureMatchingDimensions`, crafted images could allocate ~30GB of raw pixel buffers (50000x50000x4 per buffer, 3 buffers).

Upstream `normalizeImage` caps at 1568x1568, but that defense is implicit.

## Findings

**Security Sentinel**: Rated Medium severity. The function should be safe regardless of how it's called.

## Proposed Solutions

### Option A: Add dimension cap in ensureMatchingDimensions (Recommended)

```typescript
const MAX_DIFF_DIMENSION = 4096;
if (width > MAX_DIFF_DIMENSION || height > MAX_DIFF_DIMENSION) {
  throw new VisualAIImageError(
    `Image dimensions ${width}x${height} exceed maximum ${MAX_DIFF_DIMENSION}x${MAX_DIFF_DIMENSION} for diff generation`,
  );
}
```

- Effort: Small — 4 lines
- Risk: None

## Acceptance Criteria

- [ ] Explicit dimension guard added
- [ ] Test for oversized images throws appropriate error

## Work Log

| Date       | Action                   |
| ---------- | ------------------------ |
| 2026-03-10 | Created from code review |
