---
title: "Add environment variable support for boolean config options (debug, trackUsage)"
date: 2026-03-16
problem_type: enhancement
severity: medium
module:
  - src/core/client.ts
  - tests/core/client.test.ts
  - README.md
tags:
  - environment-variables
  - configuration
  - boolean-parsing
  - debug
  - trackUsage
  - CI
  - defaults
description: "Added parseBooleanEnv helper and env var resolution for VISUAL_AI_DEBUG and VISUAL_AI_TRACK_USAGE, fixing config propagation and aligning trackUsage default documentation with actual code."
---

# Environment Variable Support for Boolean Config Options

## Problem

The library supported env var fallbacks for string-valued config options (`VISUAL_AI_PROVIDER`, `VISUAL_AI_MODEL`) but not for boolean flags (`debug`, `trackUsage`). Users couldn't toggle debug logging or usage tracking via environment variables in CI pipelines without modifying source code.

Additionally, the README documented `trackUsage` as defaulting to `true`, but the actual code treated `undefined` as falsy (default OFF).

## Root Cause

No env var fallback was implemented for boolean config options. The existing `config ?? env ?? default` pattern only covered string-valued options. Boolean env vars require special parsing because JavaScript string truthiness doesn't work (`"false"` is truthy).

## Solution

### 1. Boolean env var parser with strict validation

```typescript
// src/core/client.ts
function parseBooleanEnv(envName: string, value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  const lower = value.toLowerCase();
  if (lower === "true" || lower === "1") return true;
  if (lower === "false" || lower === "0") return false;
  throw new VisualAIConfigError(
    `Invalid ${envName} value: "${value}". Use "true", "1", "false", or "0".`,
  );
}
```

### 2. Three-tier resolution in the factory function

```typescript
// src/core/client.ts — inside visualAI()
const debug =
  config.debug ?? parseBooleanEnv("VISUAL_AI_DEBUG", process.env.VISUAL_AI_DEBUG) ?? false;
const trackUsage =
  config.trackUsage ??
  parseBooleanEnv("VISUAL_AI_TRACK_USAGE", process.env.VISUAL_AI_TRACK_USAGE) ??
  false;
const resolvedConfig: VisualAIConfig = { ...config, debug, trackUsage };
```

### 3. Consistent downstream propagation

All `debugLog()`, `usageLog()`, and `createDriver()` calls use `resolvedConfig` instead of the raw `config`.

## Key Design Decisions

- **Strict validation over permissive parsing**: Only `"true"`, `"1"`, `"false"`, `"0"` accepted. Throws on `"yes"`, `"no"`, etc. — consistent with `VISUAL_AI_PROVIDER` validation.
- **Error messages include the env var name**: `Invalid VISUAL_AI_DEBUG value: "maybe"` is more helpful than a generic message.
- **Empty string treated as unset**: `VISUAL_AI_DEBUG=""` behaves the same as unset (common CI pattern).
- **Precedence: config > env var > false**: Matches the existing string config resolution pattern.

## Review Findings Addressed

1. **`createDriver` receiving raw config**: Initially, `createDriver(provider, model, config)` was not updated to use `resolvedConfig`. Fixed to pass `resolvedConfig` so provider drivers see fully resolved values.
2. **Error message missing env var name**: The original `parseBooleanEnv(value)` signature didn't identify which env var was invalid. Added `envName` parameter.

## Prevention: Checklist for Adding New Config Options

- [ ] Add to `VisualAIConfig` interface in `src/types.ts`
- [ ] Add env var fallback in `visualAI()` using `parseBooleanEnv` (for booleans) or direct read (for strings)
- [ ] Include in `resolvedConfig` spread
- [ ] Verify all downstream consumers receive `resolvedConfig`, not raw `config`
- [ ] Add tests: default value, env var fallback, config precedence, invalid values
- [ ] Update README: env var table + config options table with correct default
- [ ] Cross-check README defaults match actual code behavior

## Related Documentation

- [per-call-api-cost-monitoring.md](../best-practices/per-call-api-cost-monitoring.md) — Documents `trackUsage` flag and `usageLog()` function
- [api-call-duration-tracking.md](../best-practices/api-call-duration-tracking.md) — Documents `processUsage()` and duration tracking
- [type-safety-and-code-deduplication-review.md](../best-practices/type-safety-and-code-deduplication-review.md) — Documents the `config ?? env ?? default` pattern for string options
