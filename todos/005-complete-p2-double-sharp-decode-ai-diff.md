---
status: complete
priority: p2
issue_id: "005"
tags: [code-review, performance]
dependencies: []
---

# Double sharp decode in generateAiDiff

## Problem Statement

`generateAiDiff` at `src/core/diff.ts:142-143` creates two sharp pipelines — one to convert to PNG, then another to read metadata from the output. This decodes the image twice unnecessarily.

## Findings

**Performance Oracle** + **Simplicity Reviewer**: Both flagged this. For a 1568x1568 image, that's ~9.8MB of unnecessary decode work.

## Proposed Solutions

### Option A: Read metadata first, then convert (Recommended)

```typescript
const img = sharp(response.imageData);
const meta = await img.metadata();
const pngData = await img.png().toBuffer();
```

- Effort: Small — 3-line change
- Risk: Low

## Acceptance Criteria

- [ ] Single sharp pipeline instance in generateAiDiff
- [ ] Tests still pass

## Work Log

| Date       | Action                   |
| ---------- | ------------------------ |
| 2026-03-10 | Created from code review |
