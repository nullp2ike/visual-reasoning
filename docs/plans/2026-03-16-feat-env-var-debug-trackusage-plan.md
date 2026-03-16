---
title: "feat: Add VISUAL_AI_DEBUG and VISUAL_AI_TRACK_USAGE env var support"
type: feat
status: completed
date: 2026-03-16
---

# feat: Add VISUAL_AI_DEBUG and VISUAL_AI_TRACK_USAGE env var support

## Overview

Allow `debug` and `trackUsage` to be configured via environment variables, following the existing `config ?? env ?? default` pattern used for `VISUAL_AI_PROVIDER` and `VISUAL_AI_MODEL`.

## Problem Statement

Currently `debug` and `trackUsage` can only be set programmatically via `VisualAIConfig`. In CI or shared test environments, users must modify source code to toggle these flags. Environment variables are already the established pattern for the other config options.

## Proposed Solution

Add two new env vars:

| Variable                | Type                                 | Maps to             |
| ----------------------- | ------------------------------------ | ------------------- |
| `VISUAL_AI_DEBUG`       | `"true"` / `"1"` / `"false"` / `"0"` | `config.debug`      |
| `VISUAL_AI_TRACK_USAGE` | `"true"` / `"1"` / `"false"` / `"0"` | `config.trackUsage` |

**Precedence:** `config property → env var → false` (matching existing pattern).

## Technical Approach

### 1. Add `parseBooleanEnv` helper in `src/core/client.ts`

```typescript
// src/core/client.ts (module-level, alongside resolveProvider/inferProviderFromModel)
function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  const lower = value.toLowerCase();
  if (lower === "true" || lower === "1") return true;
  if (lower === "false" || lower === "0") return false;
  throw new VisualAIConfigError(
    `Invalid boolean env value: "${value}". Use "true", "1", "false", or "0".`,
  );
}
```

Throws on invalid values — consistent with `VISUAL_AI_PROVIDER` validation.

### 2. Resolve in `visualAI()` and create merged config

```typescript
// src/core/client.ts — inside visualAI(), after provider/model resolution
const debug = config.debug ?? parseBooleanEnv(process.env.VISUAL_AI_DEBUG) ?? false;
const trackUsage = config.trackUsage ?? parseBooleanEnv(process.env.VISUAL_AI_TRACK_USAGE) ?? false;
const resolvedConfig: VisualAIConfig = { ...config, debug, trackUsage };
```

Then pass `resolvedConfig` to `debugLog()` and `usageLog()` instead of `config`.

### 3. Tests — `tests/core/client.test.ts`

Follow the existing env var test pattern (save/delete/restore):

```typescript
describe("boolean env var config", () => {
  const savedDebug = process.env.VISUAL_AI_DEBUG;
  const savedTrackUsage = process.env.VISUAL_AI_TRACK_USAGE;

  beforeEach(() => {
    delete process.env.VISUAL_AI_DEBUG;
    delete process.env.VISUAL_AI_TRACK_USAGE;
  });

  afterEach(() => {
    if (savedDebug === undefined) delete process.env.VISUAL_AI_DEBUG;
    else process.env.VISUAL_AI_DEBUG = savedDebug;
    if (savedTrackUsage === undefined) delete process.env.VISUAL_AI_TRACK_USAGE;
    else process.env.VISUAL_AI_TRACK_USAGE = savedTrackUsage;
  });
  // ...
});
```

**Test cases:**

- [ ] `VISUAL_AI_DEBUG=true` enables debug logging (stderr spy)
- [ ] `VISUAL_AI_DEBUG=1` enables debug logging
- [ ] `VISUAL_AI_DEBUG=false` suppresses debug logging
- [ ] `config.debug` takes precedence over `VISUAL_AI_DEBUG`
- [ ] `VISUAL_AI_TRACK_USAGE=true` enables usage logging
- [ ] `VISUAL_AI_TRACK_USAGE=1` enables usage logging
- [ ] `VISUAL_AI_TRACK_USAGE=false` suppresses usage logging
- [ ] `config.trackUsage` takes precedence over `VISUAL_AI_TRACK_USAGE`
- [ ] Invalid value (e.g. `"maybe"`) throws `VisualAIConfigError`
- [ ] Unset env var falls through to default (`false`)

### 4. Update `README.md`

Add to the "Optional Configuration" env var table (~line 370):

| Variable                | Description                               |
| ----------------------- | ----------------------------------------- |
| `VISUAL_AI_DEBUG`       | Enable debug logging (`"true"` or `"1"`)  |
| `VISUAL_AI_TRACK_USAGE` | Enable usage tracking (`"true"` or `"1"`) |

Fix the Configuration table: change `trackUsage` default from `true` to `false` (matches actual code behavior).

## Acceptance Criteria

- [x] `VISUAL_AI_DEBUG` env var enables/disables debug logging
- [x] `VISUAL_AI_TRACK_USAGE` env var enables/disables usage tracking
- [x] Config properties take precedence over env vars
- [x] Invalid env values throw `VisualAIConfigError`
- [x] `parseBooleanEnv` helper is tested
- [x] README documents both new env vars
- [x] README `trackUsage` default is corrected to `false`
- [x] All existing tests continue to pass

## Files to Change

| File                        | Change                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| `src/core/client.ts`        | Add `parseBooleanEnv`, resolve `debug`/`trackUsage` in `visualAI()` |
| `tests/core/client.test.ts` | Add env var boolean config test block                               |
| `README.md`                 | Add env vars to table, fix `trackUsage` default                     |

## References

- Existing env var pattern: [client.ts:103-131](src/core/client.ts#L103-L131) (`resolveProvider`)
- Existing model env fallback: [client.ts:156](src/core/client.ts#L156)
- `debugLog`: [client.ts:133-137](src/core/client.ts#L133-L137)
- `usageLog`: [client.ts:139-152](src/core/client.ts#L139-L152)
- Env var test pattern: [client.test.ts:90-112](tests/core/client.test.ts#L90-L112)
- README env var table: [README.md:370](README.md#L370)
