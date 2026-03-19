---
title: "refactor: Remove VISUAL_AI_REASONING_EFFORT environment variable"
type: refactor
status: completed
date: 2026-03-19
---

# refactor: Remove VISUAL_AI_REASONING_EFFORT environment variable

Remove the `VISUAL_AI_REASONING_EFFORT` environment variable support. Reasoning effort should only be configurable via the `reasoningEffort` property in `visualAI()` options.

The env var was added in v0.6.0 (2026-03-18) and is being removed before it gains adoption. This simplifies the API surface — reasoning effort is a per-client setting, not an environment-level concern.

## Acceptance Criteria

- [ ] `VISUAL_AI_REASONING_EFFORT` env var is no longer read or validated
- [ ] `reasoningEffort` config option continues to work identically
- [ ] Provider drivers are unaffected (no changes needed)
- [ ] All tests pass, no dead code remains
- [ ] README env var table no longer lists `VISUAL_AI_REASONING_EFFORT`

## MVP

### 1. Remove env var parsing from `src/core/config.ts`

Remove the `VALID_REASONING_EFFORTS` constant, the `parseReasoningEffortEnv()` function, and the unused `ReasoningEffort` type import.

Simplify the `resolveConfig()` reasoning effort resolution from:

```typescript
// src/core/config.ts (BEFORE)
reasoningEffort:
  config.reasoningEffort ??
  parseReasoningEffortEnv("VISUAL_AI_REASONING_EFFORT", process.env.VISUAL_AI_REASONING_EFFORT),
```

to:

```typescript
// src/core/config.ts (AFTER)
reasoningEffort: config.reasoningEffort,
```

### 2. Remove env var tests from `tests/core/config.test.ts`

- Remove the entire `describe("VISUAL_AI_REASONING_EFFORT")` block (~lines 271-310)
- Remove `VISUAL_AI_REASONING_EFFORT` from `ORIGINAL_ENV` snapshot and `restoreEnv()` cleanup

### 3. Update `README.md`

Remove the `VISUAL_AI_REASONING_EFFORT` row from the environment variables table (~line 396).

### 4. Verify

Run full check suite: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

## Context

- **Why remove**: Reasoning effort is a per-client concern, not an environment config. Keeping the API surface minimal before the library gains wider adoption.
- **Risk**: Negligible — feature was public for <24 hours. Anyone who set the env var will silently fall back to provider defaults (no errors, no crashes).
- **Provider drivers**: Untouched. They consume `reasoningEffort` from `ProviderConfig` regardless of how it was resolved.
- **Version**: Patch bump (0.6.1) since pre-1.0 and the feature had minimal exposure.

## Files Changed

| File                        | Change                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/core/config.ts`        | Remove `VALID_REASONING_EFFORTS`, `parseReasoningEffortEnv()`, unused `ReasoningEffort` import; simplify `resolveConfig()` |
| `tests/core/config.test.ts` | Remove `describe("VISUAL_AI_REASONING_EFFORT")` block, env var from `ORIGINAL_ENV`/`restoreEnv()`                          |
| `README.md`                 | Remove env var table row                                                                                                   |

## Sources

- Supersedes: [2026-03-18-004-feat-reasoning-effort-env-var-plan.md](docs/plans/2026-03-18-004-feat-reasoning-effort-env-var-plan.md)
- Related learning: [env-var-boolean-config-fallbacks-documentation-consistency.md](docs/solutions/best-practices/env-var-boolean-config-fallbacks-documentation-consistency.md)
