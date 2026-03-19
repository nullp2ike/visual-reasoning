---
status: pending
priority: p3
issue_id: "014"
tags: [code-review, observability]
dependencies: []
---

# Add debug log when maxTokens is auto-increased for OpenAI reasoning

## Problem Statement

When the library auto-increases `maxTokens` from 4096 to 16384 for OpenAI with high/xhigh reasoning, there is no debug log to inform users. This could cause confusion when users see unexpected token usage.

## Proposed Solutions

### Solution A: Add debug log in resolveConfig (Recommended)

Log when auto-increase triggers, e.g.: `"Auto-increased maxTokens to 16384 for OpenAI with reasoning effort: high"`

**Effort:** Small
**Risk:** None

## Acceptance Criteria

- [ ] Debug log emitted when auto-increase triggers
- [ ] Log includes original and new maxTokens values

## Work Log

| Date       | Action                   | Learnings |
| ---------- | ------------------------ | --------- |
| 2026-03-19 | Created from code review |           |
