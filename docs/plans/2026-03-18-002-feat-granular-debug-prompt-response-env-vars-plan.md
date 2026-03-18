---
title: "feat: Add separate env vars for debug prompt and response logging"
type: feat
status: completed
date: 2026-03-18
---

# feat: Add separate env vars for debug prompt and response logging

## Overview

Currently `VISUAL_AI_DEBUG=true` (or `config.debug`) logs **both** the prompt sent to the AI provider and the response received. Users need granular control to log only prompts (for debugging prompt construction) or only responses (for inspecting model output) without the noise of the other.

## Problem Statement

When debugging, the combined output of prompts + responses is verbose. Prompts contain the full system instructions and can be hundreds of lines, making it hard to scan for the response — and vice versa. Users want to toggle each independently.

## Proposed Solution

Add two new boolean env vars and two new config fields:

| New Env Var                | Config Field    | Controls              |
| -------------------------- | --------------- | --------------------- |
| `VISUAL_AI_DEBUG_PROMPT`   | `debugPrompt`   | Prompt logging only   |
| `VISUAL_AI_DEBUG_RESPONSE` | `debugResponse` | Response logging only |

### Backwards Compatibility

- `VISUAL_AI_DEBUG=true` / `config.debug=true` enables **both** prompt and response logging (unchanged behavior)
- The new granular vars/fields override the `debug` shorthand when set explicitly

### Resolution Precedence

For each log kind (prompt / response):

```
config.debugPrompt > VISUAL_AI_DEBUG_PROMPT > config.debug > VISUAL_AI_DEBUG > false
```

Same pattern for `debugResponse` / `VISUAL_AI_DEBUG_RESPONSE`.

## Technical Considerations

### Files to Change

1. **`src/types.ts`** — Add `debugPrompt?: boolean` and `debugResponse?: boolean` to `VisualAIConfig`
2. **`src/core/config.ts`** — Add `debugPrompt` and `debugResponse` to `ResolvedConfig`; resolve using three-tier precedence (`config field > env var > debug fallback > false`)
3. **`src/core/debug.ts`** — Change `debugLog` to accept a `kind: "prompt" | "response" | "error"` parameter and check the corresponding resolved flag. `"error"` kind uses the existing `debug` flag (for non-prompt/response debug lines like diff errors)
4. **`src/core/client.ts`** — Update all `debugLog` call sites to pass the appropriate kind
5. **`tests/core/config.test.ts`** — Test resolution precedence for new fields
6. **`tests/core/client.test.ts`** — Test that prompt/response logging respects granular flags
7. **`README.md`** — Document new env vars and config fields

### Existing Pattern to Follow

The codebase already has `parseBooleanEnv()` in `src/core/config.ts` for strict boolean env var parsing. Reuse it for the two new env vars. Follow the same `config > env > default` precedence established for `debug` and `trackUsage` (see `docs/solutions/best-practices/env-var-boolean-config-fallbacks-documentation-consistency.md`).

### Key Gotchas (from institutional learnings)

- **String truthiness**: `"false"` is truthy in JS — must use `parseBooleanEnv()`, not `!!`
- **Empty string = unset**: `VISUAL_AI_DEBUG_PROMPT=""` must behave as unset
- **Error messages include env var name**: `Invalid VISUAL_AI_DEBUG_PROMPT value: "maybe"`
- **Pass resolved config downstream**: All consumers receive `resolvedConfig`, not raw config

## Acceptance Criteria

- [ ] `VISUAL_AI_DEBUG_PROMPT=true` logs only prompts to stderr
- [ ] `VISUAL_AI_DEBUG_RESPONSE=true` logs only responses to stderr
- [ ] `VISUAL_AI_DEBUG=true` still logs both (backwards compatible)
- [ ] `config.debugPrompt` / `config.debugResponse` work the same as the env vars
- [ ] Config fields take precedence over env vars
- [ ] `config.debug=true` enables both when granular fields are not set
- [ ] `config.debugPrompt=false` with `config.debug=true` suppresses prompt logging but keeps response logging
- [ ] Invalid env var values throw `VisualAIConfigError` with the env var name
- [ ] Empty string env vars treated as unset
- [ ] Error/warning debug lines (e.g., diff error) still controlled by `debug` flag
- [ ] README env var table and config table updated
- [ ] Tests cover all precedence combinations

## MVP

### `src/types.ts` — Add config fields

```typescript
export interface VisualAIConfig {
  apiKey?: string;
  model?: string;
  debug?: boolean;
  debugPrompt?: boolean;
  debugResponse?: boolean;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  trackUsage?: boolean;
}
```

### `src/core/config.ts` — Resolve new fields

```typescript
export interface ResolvedConfig {
  provider: ProviderName;
  apiKey: string | undefined;
  model: string;
  maxTokens: number;
  reasoningEffort: VisualAIConfig["reasoningEffort"];
  debug: boolean;
  debugPrompt: boolean;
  debugResponse: boolean;
  trackUsage: boolean;
}

export function resolveConfig(config: VisualAIConfig): ResolvedConfig {
  const provider = resolveProvider(config);
  const model = config.model ?? process.env.VISUAL_AI_MODEL ?? DEFAULT_MODELS[provider];
  const debug =
    config.debug ?? parseBooleanEnv("VISUAL_AI_DEBUG", process.env.VISUAL_AI_DEBUG) ?? false;

  return {
    provider,
    apiKey: config.apiKey,
    model,
    maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    reasoningEffort: config.reasoningEffort,
    debug,
    debugPrompt:
      config.debugPrompt ??
      parseBooleanEnv("VISUAL_AI_DEBUG_PROMPT", process.env.VISUAL_AI_DEBUG_PROMPT) ??
      debug,
    debugResponse:
      config.debugResponse ??
      parseBooleanEnv("VISUAL_AI_DEBUG_RESPONSE", process.env.VISUAL_AI_DEBUG_RESPONSE) ??
      debug,
    trackUsage:
      config.trackUsage ??
      parseBooleanEnv("VISUAL_AI_TRACK_USAGE", process.env.VISUAL_AI_TRACK_USAGE) ??
      false,
  };
}
```

### `src/core/debug.ts` — Kind-aware logging

```typescript
export type DebugLogKind = "prompt" | "response" | "error";

export function debugLog(
  config: ResolvedConfig,
  label: string,
  data: string,
  kind: DebugLogKind = "error",
): void {
  const enabled =
    kind === "prompt"
      ? config.debugPrompt
      : kind === "response"
        ? config.debugResponse
        : config.debug;

  if (enabled) {
    process.stderr.write(`[visual-ai-assertions] ${label}: ${data}\n`);
  }
}
```

### `src/core/client.ts` — Update call sites

```typescript
// Before:
debugLog(resolvedConfig, "check prompt", prompt);
debugLog(resolvedConfig, "check response", response.text);

// After:
debugLog(resolvedConfig, "check prompt", prompt, "prompt");
debugLog(resolvedConfig, "check response", response.text, "response");
```

Same pattern for all methods: `check`, `ask`, `compare`, `elementsVisible/Hidden`, `accessibility`, `layout`, `pageLoad`, `content`.

### `tests/core/config.test.ts` — New test cases

```typescript
describe("debugPrompt / debugResponse resolution", () => {
  it("defaults to false when debug is false", () => {
    /* ... */
  });
  it("inherits from debug=true when not set", () => {
    /* ... */
  });
  it("VISUAL_AI_DEBUG_PROMPT=true enables prompt logging independently", () => {
    /* ... */
  });
  it("config.debugPrompt overrides VISUAL_AI_DEBUG_PROMPT env", () => {
    /* ... */
  });
  it("config.debugPrompt=false suppresses even when debug=true", () => {
    /* ... */
  });
  it("throws on invalid VISUAL_AI_DEBUG_PROMPT values", () => {
    /* ... */
  });
  it("empty VISUAL_AI_DEBUG_PROMPT treated as unset", () => {
    /* ... */
  });
  // Mirror tests for debugResponse
});
```

### `tests/core/client.test.ts` — Granular logging tests

```typescript
describe("granular debug logging", () => {
  it("debugPrompt=true logs only prompts, not responses", () => {
    /* ... */
  });
  it("debugResponse=true logs only responses, not prompts", () => {
    /* ... */
  });
  it("debug=true still logs both", () => {
    /* ... */
  });
});
```

## Sources

- Existing pattern: [config.ts:72](src/core/config.ts#L72) — current `debug` resolution
- Debug logging: [debug.ts:6-9](src/core/debug.ts#L6-L9) — current `debugLog` function
- Call sites: [client.ts:266-417](src/core/client.ts#L266-L417) — all `debugLog` callers
- Institutional learning: [env-var-boolean-config-fallbacks-documentation-consistency.md](docs/solutions/best-practices/env-var-boolean-config-fallbacks-documentation-consistency.md)
