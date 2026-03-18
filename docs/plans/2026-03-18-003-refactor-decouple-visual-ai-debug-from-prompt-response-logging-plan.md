---
title: "refactor: Decouple VISUAL_AI_DEBUG from prompt/response logging"
type: refactor
status: active
date: 2026-03-18
---

# refactor: Decouple VISUAL_AI_DEBUG from prompt/response logging

## Overview

`VISUAL_AI_DEBUG` currently serves as a master switch that enables prompt logging, response logging, AND error debug logging via a fallback chain. Now that `VISUAL_AI_DEBUG_PROMPT` and `VISUAL_AI_DEBUG_RESPONSE` exist as granular controls, `VISUAL_AI_DEBUG` should be decoupled from prompt/response logging and reserved exclusively for error/diagnostic debugging.

## Problem Statement

The fallback chain in config resolution (`src/core/config.ts:77-84`) makes `VISUAL_AI_DEBUG` cascade into `debugPrompt` and `debugResponse`:

```
debugPrompt  = config.debugPrompt  ?? VISUAL_AI_DEBUG_PROMPT  ?? debug ?? false
debugResponse = config.debugResponse ?? VISUAL_AI_DEBUG_RESPONSE ?? debug ?? false
```

This means `VISUAL_AI_DEBUG=true` still enables prompt/response logging, making the granular vars partially redundant. Additionally, nothing in the codebase actually calls `debugLog` with `kind === "error"`, so the error-only path is unused.

## Proposed Solution

1. **Remove `debug` as fallback** for `debugPrompt`/`debugResponse` in config resolution
2. **Add error debug logging** to `client.ts` so `VISUAL_AI_DEBUG` has a real purpose
3. **Update docs and tests** to reflect the new semantics

### New precedence chains

```
debugPrompt   = config.debugPrompt  ?? VISUAL_AI_DEBUG_PROMPT  ?? false
debugResponse = config.debugResponse ?? VISUAL_AI_DEBUG_RESPONSE ?? false
debug         = config.debug ?? VISUAL_AI_DEBUG ?? false  (unchanged)
```

## Technical Considerations

### Breaking change

This is a **breaking change** for users who rely on `VISUAL_AI_DEBUG=true` to see prompts and responses. After this change, they must explicitly set `VISUAL_AI_DEBUG_PROMPT=true` and/or `VISUAL_AI_DEBUG_RESPONSE=true`.

**Migration:** Emit a one-time stderr warning when `VISUAL_AI_DEBUG=true` is detected and neither `VISUAL_AI_DEBUG_PROMPT` nor `VISUAL_AI_DEBUG_RESPONSE` is set:

```
[visual-ai-assertions] Warning: VISUAL_AI_DEBUG no longer enables prompt/response logging.
Use VISUAL_AI_DEBUG_PROMPT=true and/or VISUAL_AI_DEBUG_RESPONSE=true instead.
```

**Semver:** This should be treated as a semver-major or, at minimum, clearly documented in release notes. Decide before merging whether to bump major version.

### Error debug logging scope

Add `debugLog(resolvedConfig, label, data, "error")` for these runtime failure categories:

| Error type            | Where caught                               | What to log                                     |
| --------------------- | ------------------------------------------ | ----------------------------------------------- |
| Image normalization   | `normalizeImage()` failures in each method | Error message + image source type               |
| Provider API errors   | `timedSendMessage()` failures              | Error class, code, message                      |
| Response parse errors | `parseCheckResponse()` etc. failures       | Error message + first 500 chars of raw response |

Skip config validation errors (thrown at instantiation, not runtime).

### Implementation pattern

Create a shared wrapper to avoid try/catch duplication across 9 methods:

```typescript
// src/core/debug.ts
async function withErrorDebug<T>(
  config: ResolvedConfig,
  method: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    debugLog(config, `${method} error`, formatError(error), "error");
    throw error;
  }
}
```

### compare() stderr warning

Migrate the direct `process.stderr.write` at `src/core/client.ts:335-336` (diff generation warning) to use `debugLog(resolvedConfig, "compare diff-generation warning", msg, "error")` for consistency.

## Acceptance Criteria

- [ ] `VISUAL_AI_DEBUG=true` no longer enables prompt/response logging
- [ ] `VISUAL_AI_DEBUG=true` enables error debug logging for provider errors, parse errors, and image normalization errors
- [ ] `VISUAL_AI_DEBUG_PROMPT` and `VISUAL_AI_DEBUG_RESPONSE` work independently without fallback to `debug`
- [ ] Deprecation warning emitted to stderr when `VISUAL_AI_DEBUG=true` without granular vars
- [ ] `config.debug = true` no longer cascades to `debugPrompt`/`debugResponse`
- [ ] `compare()` diff warning migrated to `debugLog` system
- [ ] All existing tests updated for new behavior
- [ ] New tests for error debug logging
- [ ] README updated: env var table, config options, behavior descriptions
- [ ] `VisualAIConfig.debug` JSDoc updated to describe error-only semantics

## Files to modify

### `src/core/config.ts`

- Remove `debug` fallback from `debugPrompt`/`debugResponse` resolution (lines 77-84)
- Add deprecation warning logic when `debug=true` and no granular vars set

### `src/core/debug.ts`

- Add `withErrorDebug()` wrapper function
- Add `formatError()` helper for consistent error formatting

### `src/core/client.ts`

- Wrap method bodies with `withErrorDebug()` for error logging
- Migrate `compare()` diff warning (line 335-336) to `debugLog`

### `src/types.ts`

- Update JSDoc for `debug` property on `VisualAIConfig` (line 148)

### `README.md`

- Update env var table (lines 393-395) to clarify `VISUAL_AI_DEBUG` is error-only
- Update config options section

### `tests/core/config.test.ts`

- Update tests that assert fallback behavior:
  - Line 129: "inherits from debug=true" -- expect `debugPrompt: false`, `debugResponse: false`
  - Line 135: "inherits from VISUAL_AI_DEBUG" -- expect both `false`
  - Line 178: "debugPrompt=false suppresses" -- expect `debugResponse: false`
  - Line 186: "debugResponse=false suppresses" -- expect `debugPrompt: false`
- Add test for deprecation warning emission

### `tests/core/client.test.ts`

- Add tests for error debug logging (provider error, parse error, image error)
- Update any tests asserting old `VISUAL_AI_DEBUG=true` enables prompt/response

## Sources

- `src/core/config.ts:67-84` -- Current config resolution with fallback chain
- `src/core/debug.ts:14-19` -- `debugLog` kind-based routing
- `src/core/client.ts` -- All 9 methods with prompt/response debug calls
- `docs/solutions/best-practices/env-var-boolean-config-fallbacks-documentation-consistency.md` -- Established patterns for boolean env vars
