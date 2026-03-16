---
title: "feat: Add API call duration tracking in seconds"
type: feat
status: completed
date: 2026-03-09
---

# feat: Add API call duration tracking in seconds

## Overview

Add `durationSeconds` to `UsageInfo` so every API call reports its wall-clock duration alongside token counts and estimated cost. This completes the per-call observability story started by the cost monitoring feature.

## Problem Statement / Motivation

Users currently see token usage and cost per call but have no visibility into **how long each call takes**. Duration data is essential for:

- Diagnosing slow API calls vs. fast auth rejections in CI/test output
- Comparing provider latency (Anthropic vs. OpenAI vs. Google)
- Detecting timeout-related issues before they become flaky tests
- Performance budgeting in E2E test suites

The existing `processUsage()` / `usageLog()` infrastructure makes this a natural, low-risk extension.

## Proposed Solution

Measure wall-clock time around `driver.sendMessage()` using `performance.now()`, round to 3 decimal places, and include `durationSeconds` in `UsageInfo`. Extract a `timedSendMessage` helper inside `createClient()` to avoid repeating the timer in all 8 client methods.

## Technical Approach

### Design Decisions

| Decision                | Choice                                              | Rationale                                                                                       |
| ----------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Field location          | Inside `UsageInfo` (not top-level)                  | Co-locates all observability data; consistent with `estimatedCost` pattern                      |
| Timer API               | `performance.now()`                                 | Monotonic (immune to clock skew), sub-ms precision, available in all supported Node.js versions |
| Precision               | 3 decimal places (ms granularity)                   | Avoids float noise in logs/JSON; `1.234` not `1.2340000000000002`                               |
| When usage is undefined | Still return `{ durationSeconds }` with zero tokens | Duration is always knowable even when provider omits token counts                               |
| Error paths             | Duration discarded (not attached to errors)         | Simplest approach; can be revisited by adding `durationSeconds` to error objects                |
| Code duplication        | Extract `timedSendMessage` helper                   | Single timing implementation for all 8 methods; prevents drift                                  |
| Schema validation       | `z.number().nonnegative().optional()`               | Prevents negative values from clock edge cases                                                  |

### What Gets Timed

Only the `driver.sendMessage()` call — the actual provider API round-trip. This **includes** lazy SDK initialization on first call (documented as expected behavior) but **excludes** image normalization, prompt construction, and response parsing.

### Implementation Phases

#### Phase 1: Types and Schema

**File:** [src/types.ts](src/types.ts)

Add `durationSeconds` to `UsageInfoSchema`:

```typescript
// src/types.ts — UsageInfoSchema (line 43)
export const UsageInfoSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  estimatedCost: z.number().optional(),
  durationSeconds: z.number().nonnegative().optional(),
});
```

`UsageInfo` type auto-updates via `z.infer`. No other type changes needed — `BaseResultSchema`, `CheckResultSchema`, `QueryResultSchema`, and `CompareResultSchema` all reference `UsageInfoSchema` by composition.

**Public API:** Both `UsageInfo` (type) and `UsageInfoSchema` (runtime) are already exported from [src/index.ts](src/index.ts). No export changes needed.

#### Phase 2: Client Timing Logic

**File:** [src/core/client.ts](src/core/client.ts)

**2a. Add `timedSendMessage` helper** inside `createClient()` closure:

```typescript
// src/core/client.ts — inside createClient(), after driver creation (line 131)
async function timedSendMessage(
  images: NormalizedImage[],
  prompt: string,
): Promise<RawProviderResponse & { durationSeconds: number }> {
  const start = performance.now();
  const response = await driver.sendMessage(images, prompt);
  const durationSeconds = Math.round(performance.now() - start) / 1000;
  return { ...response, durationSeconds };
}
```

**2b. Update `processUsage()` signature** to accept `durationSeconds`:

```typescript
// src/core/client.ts — processUsage() (line 133)
function processUsage(
  method: string,
  rawUsage: { inputTokens: number; outputTokens: number } | undefined,
  durationSeconds: number,
): UsageInfo {
  const inputTokens = rawUsage?.inputTokens ?? 0;
  const outputTokens = rawUsage?.outputTokens ?? 0;
  const estimatedCost = calculateCost(provider, model, inputTokens, outputTokens);
  usageLog(config, method, { inputTokens, outputTokens }, estimatedCost, durationSeconds);
  return { inputTokens, outputTokens, estimatedCost, durationSeconds };
}
```

Key change: `processUsage()` now **always returns a `UsageInfo` object** (never `undefined`). When the provider omits usage data, tokens default to `0` but `durationSeconds` is still reported. This resolves the gap where duration was lost when `rawUsage` was `undefined`.

**2c. Update `usageLog()` to include duration:**

```typescript
// src/core/client.ts — usageLog() (line 115)
function usageLog(
  config: ClientConfig,
  method: string,
  usage: { inputTokens: number; outputTokens: number },
  estimatedCost: number | undefined,
  durationSeconds: number,
): void {
  if (config.trackUsage === false) return;
  const costStr = estimatedCost !== undefined ? `$${estimatedCost.toFixed(6)}` : "unknown";
  process.stderr.write(
    `[visual-ai-assertions] ${method} usage: ${usage.inputTokens} input + ${usage.outputTokens} output tokens (${costStr}) in ${durationSeconds.toFixed(3)}s\n`,
  );
}
```

**2d. Update all 8 client methods** to use `timedSendMessage` and pass `durationSeconds`:

Each method changes from:

```typescript
const response = await driver.sendMessage([img], prompt);
// ...
return { ...result, usage: processUsage("check", response.usage) };
```

To:

```typescript
const response = await timedSendMessage([img], prompt);
// ...
return { ...result, usage: processUsage("check", response.usage, response.durationSeconds) };
```

Methods to update:

- `check` ([client.ts:156](src/core/client.ts#L156))
- `query` ([client.ts:168](src/core/client.ts#L168))
- `compare` ([client.ts:183](src/core/client.ts#L183))
- `missingElements` ([client.ts:195](src/core/client.ts#L195))
- `accessibility` ([client.ts:207](src/core/client.ts#L207))
- `layout` ([client.ts:219](src/core/client.ts#L219))
- `pageLoad` ([client.ts:231](src/core/client.ts#L231))
- `content` ([client.ts:243](src/core/client.ts#L243))

#### Phase 3: Import Addition

**File:** [src/core/client.ts](src/core/client.ts)

Add import for `NormalizedImage` type (needed by `timedSendMessage` signature) and `performance` from `node:perf_hooks` if not using globalThis:

```typescript
import type { NormalizedImage } from "../types.js";
import type { RawProviderResponse } from "../providers/types.js";
```

Note: `performance` is available globally in Node.js 16+ (the project's minimum). No import needed for `performance.now()` itself.

### Files Modified Summary

| File                                                                       | Change                                                                                                      |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [src/types.ts](src/types.ts)                                               | Add `durationSeconds` to `UsageInfoSchema`                                                                  |
| [src/core/client.ts](src/core/client.ts)                                   | Add `timedSendMessage` helper, update `processUsage()` and `usageLog()` signatures, update 8 client methods |
| [tests/types.test.ts](tests/types.test.ts)                                 | Schema tests for `durationSeconds`                                                                          |
| [tests/core/client.test.ts](tests/core/client.test.ts)                     | Duration in results, logging, trackUsage:false                                                              |
| [tests/core/client-templates.test.ts](tests/core/client-templates.test.ts) | Duration in template method results                                                                         |
| [tests/integration/full-flow.test.ts](tests/integration/full-flow.test.ts) | Duration in full flow                                                                                       |
| [tests/smoke/anthropic.smoke.test.ts](tests/smoke/anthropic.smoke.test.ts) | `assertUsageTracked()` checks `durationSeconds`                                                             |
| [tests/smoke/openai.smoke.test.ts](tests/smoke/openai.smoke.test.ts)       | Same                                                                                                        |
| [tests/smoke/google.smoke.test.ts](tests/smoke/google.smoke.test.ts)       | Same                                                                                                        |

### Files NOT Modified

| File                         | Why                                                               |
| ---------------------------- | ----------------------------------------------------------------- |
| `src/providers/anthropic.ts` | Timing is client-layer, not provider-layer                        |
| `src/providers/openai.ts`    | Same                                                              |
| `src/providers/google.ts`    | Same                                                              |
| `src/providers/types.ts`     | `RawProviderResponse` unchanged — providers don't report duration |
| `src/core/pricing.ts`        | Duration has no pricing dimension                                 |
| `src/index.ts`               | No new exports needed                                             |

## Acceptance Criteria

### Functional Requirements

- [x] `result.usage.durationSeconds` is a non-negative number on every successful API call across all 8 methods
- [x] `durationSeconds` is present even when the provider returns no token usage metadata (tokens default to 0)
- [x] `durationSeconds` measures only `driver.sendMessage()` round-trip, not image normalization or prompt construction
- [x] `durationSeconds` is rounded to 3 decimal places (millisecond precision)
- [x] Stderr log includes duration: `... in 1.234s`
- [x] When `trackUsage: false`, duration is NOT logged to stderr but IS present in `result.usage`
- [x] `UsageInfoSchema` validates `durationSeconds` as `z.number().nonnegative().optional()`
- [x] Backward compatible: existing code that ignores `durationSeconds` continues to work

### Testing Requirements

- [x] **Schema tests:** `UsageInfoSchema` accepts objects with/without `durationSeconds`; rejects negative values
- [x] **Client unit tests:** Mock `performance.now()` to return deterministic values; verify `durationSeconds` is computed correctly as `(end - start) / 1000`
- [x] **Client unit tests:** Verify `durationSeconds` appears in stderr log output with correct format
- [x] **Client unit tests:** Verify `trackUsage: false` suppresses log but `durationSeconds` still in result
- [x] **Client unit tests:** Verify `durationSeconds` is present when provider returns no usage (rawUsage undefined)
- [x] **Template tests:** All 5 template methods (missingElements, accessibility, layout, pageLoad, content) include `durationSeconds`
- [x] **Integration tests:** Full flow tests verify `durationSeconds` is a positive number
- [x] **Smoke tests:** Real API calls return `durationSeconds > 0` and `durationSeconds < 30`

### Test Strategy for Deterministic Timing

Use `vi.spyOn(performance, 'now')` to control the timer:

```typescript
const perfSpy = vi.spyOn(performance, "now");
perfSpy.mockReturnValueOnce(1000); // start
perfSpy.mockReturnValueOnce(3500); // end → 2.500s
// ... assert result.usage.durationSeconds === 2.5
```

## Dependencies & Risks

**Low risk.** This follows the exact pattern established by the cost monitoring feature:

- Additive change to `UsageInfo` (optional field) — no breaking changes
- Timing logic is trivial and well-understood
- No new dependencies
- No provider driver changes
- `performance.now()` is stable and universally available

**One behavioral change:** `processUsage()` will now always return a `UsageInfo` object instead of `undefined` when `rawUsage` is missing. This means `result.usage` will be defined on every successful call. This is technically a non-breaking change (the type was already `UsageInfo | undefined` — narrowing to always `UsageInfo` is compatible) but worth noting.

## Future Considerations

- **Duration on error paths:** Could add `durationSeconds` to `VisualAIProviderError` to track timeout vs. fast-rejection latency. Out of scope for this PR.
- **Cumulative duration tracking:** Same decision as cumulative cost — per-call only, users aggregate themselves.
- **First-call SDK import inflation:** The first `sendMessage()` includes lazy SDK import time. Could document this or add a `warmup()` method later.

## References & Research

### Internal References

- Brainstorm: [docs/brainstorms/2026-02-16-api-cost-monitoring-brainstorm.md](docs/brainstorms/2026-02-16-api-cost-monitoring-brainstorm.md) — established the per-call observability pattern
- Solution: [docs/solutions/best-practices/per-call-api-cost-monitoring.md](docs/solutions/best-practices/per-call-api-cost-monitoring.md) — `processUsage()` pattern, `trackUsage === false` guard, stderr logging
- Solution: [docs/solutions/integration-issues/api-integration-bugs-undetectable-by-mocked-tests.md](docs/solutions/integration-issues/api-integration-bugs-undetectable-by-mocked-tests.md) — smoke tests as the guard for real API behavior
- Commit: `aa63e7f` — original cost monitoring implementation
