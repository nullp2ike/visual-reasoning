---
status: complete
priority: p3
issue_id: "007"
tags: [code-review, quality, duplication]
dependencies: []
---

# Extract duplicated imageParts mapping in GoogleDriver

## Problem Statement

The same 5-line `imageParts` mapping block appears in both `sendMessage` (line 83) and `generateImage` (line 138) of `src/providers/google.ts`.

## Findings

**Simplicity Reviewer**: Straightforward extract-method candidate. A private `toGeminiParts(images)` helper removes duplication.

## Proposed Solutions

### Option A: Extract private method

```typescript
private toGeminiParts(images: NormalizedImage[]) {
  return images.map((img) => ({
    inlineData: { data: img.base64, mimeType: img.mimeType },
  }));
}
```

- Effort: Small — ~5 lines saved
- Risk: None

## Work Log

| Date       | Action                   |
| ---------- | ------------------------ |
| 2026-03-10 | Created from code review |
