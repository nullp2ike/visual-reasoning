---
status: complete
priority: p2
issue_id: "002"
tags: [code-review, quality, conventions]
dependencies: []
---

# Move AI_DIFF_PROMPT to src/core/prompt.ts

## Problem Statement

`AI_DIFF_PROMPT` is defined inline at `src/core/diff.ts:121-126`. CLAUDE.md states: "Keep prompts in dedicated functions: Prompt text lives in `src/core/prompt.ts` and `src/templates/*.ts`, not inline."

## Findings

**TypeScript Reviewer** + **Architecture Strategist**: Both flagged this as a convention violation. The prompt instructs an AI model and belongs alongside `COMPARE_ROLE`, `buildCheckPrompt`, etc.

## Proposed Solutions

### Option A: Move to `src/core/prompt.ts` as `buildAiDiffPrompt()` (Recommended)

- Consistent with existing `buildCheckPrompt`, `buildComparePrompt` pattern
- Effort: Small
- Risk: None

## Acceptance Criteria

- [ ] `AI_DIFF_PROMPT` moved to `src/core/prompt.ts`
- [ ] Exported as `buildAiDiffPrompt()` function
- [ ] `src/core/diff.ts` imports from prompt module

## Work Log

| Date       | Action                   |
| ---------- | ------------------------ |
| 2026-03-10 | Created from code review |
