---
status: complete
priority: p2
issue_id: "003"
tags: [code-review, quality, error-handling]
dependencies: []
---

# Wrong error class for API response failures in generateImage

## Problem Statement

`GoogleDriver.generateImage()` at `src/providers/google.ts:159,164` throws `VisualAIConfigError` for "no response parts" and "no image data" — but these are API response failures, not user configuration errors.

## Findings

**TypeScript Reviewer**: `VisualAIConfigError` semantically means "user misconfigured something." These errors fire when the Gemini API returns unexpected response shapes — that's a provider error. Users will look at their config when the problem is the API response.

## Proposed Solutions

### Option A: Use `VisualAIProviderError` (Recommended)

- Effort: Small — change two error constructors
- Risk: Technically a breaking change for consumers catching specific error types, but unlikely anyone is catching these yet

## Acceptance Criteria

- [ ] "no response parts" throws `VisualAIProviderError`
- [ ] "no image data" throws `VisualAIProviderError`
- [ ] Tests updated to expect `VisualAIProviderError`

## Work Log

| Date       | Action                   |
| ---------- | ------------------------ |
| 2026-03-10 | Created from code review |
