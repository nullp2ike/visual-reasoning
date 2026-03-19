---
status: pending
priority: p2
issue_id: "011"
tags: [code-review, quality, providers]
dependencies: []
---

# Google finishReason handling throws VisualAITruncationError for non-truncation reasons

## Problem Statement

The Google provider throws `VisualAITruncationError` for _any_ `finishReason` that isn't `"STOP"`, including `"SAFETY"`, `"RECITATION"`, `"OTHER"`, etc. These are semantically different from truncation — a safety-blocked response is not a truncated response. This misclassifies errors and could confuse users.

Flagged by 4 of 6 review agents.

## Findings

- `src/providers/google.ts:141-147` — condition `finishReason !== "STOP"` catches SAFETY, RECITATION, OTHER, PROHIBITED_CONTENT, SPII, MALFORMED_FUNCTION_CALL
- Only `MAX_TOKENS` actually indicates truncation
- Other providers correctly scope their truncation detection (OpenAI checks `status !== "completed"`, Anthropic checks `stop_reason === "max_tokens"`)

## Proposed Solutions

### Solution A: Only throw VisualAITruncationError for MAX_TOKENS (Recommended)

Change the condition to `finishReason === "MAX_TOKENS"` and throw `VisualAIProviderError` for other non-STOP reasons.

**Pros:** Semantically correct, consistent with other providers
**Cons:** None
**Effort:** Small
**Risk:** Low

### Solution B: Throw VisualAITruncationError for MAX_TOKENS, VisualAIProviderError for others

Same as A but with explicit handling for each known finishReason.

**Pros:** More specific error messages per reason
**Cons:** Slightly more code, Google may add new reasons
**Effort:** Small
**Risk:** Low

## Recommended Action

Solution A — keep it simple.

## Technical Details

- **Affected files:** `src/providers/google.ts`, `tests/providers/google.test.ts`

## Acceptance Criteria

- [ ] `VisualAITruncationError` only thrown for `finishReason === "MAX_TOKENS"`
- [ ] Other non-STOP reasons throw `VisualAIProviderError`
- [ ] Tests updated for SAFETY, RECITATION scenarios
- [ ] Existing MAX_TOKENS test still passes

## Work Log

| Date       | Action                   | Learnings                    |
| ---------- | ------------------------ | ---------------------------- |
| 2026-03-19 | Created from code review | Flagged by 4/6 review agents |

## Resources

- PR: current branch
- Google AI docs: finishReason enum values
