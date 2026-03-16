---
title: "Add API call duration tracking to visual-ai-assertions"
date: 2026-03-09
category: best-practices
tags:
  - api-timing
  - duration-tracking
  - usage-info
  - observability
  - performance-monitoring
  - provider-drivers
  - zod-validation
severity: low
components:
  - src/types.ts
  - src/core/client.ts
  - tests/types.test.ts
  - tests/core/client.test.ts
  - tests/core/client-templates.test.ts
  - tests/integration/full-flow.test.ts
  - tests/smoke/anthropic.smoke.test.ts
  - tests/smoke/openai.smoke.test.ts
  - tests/smoke/google.smoke.test.ts
problem_type: enhancement
search_keywords:
  - durationSeconds
  - performance.now
  - timedSendMessage
  - processUsage
  - usageLog
  - wall-clock timing
  - API latency
---

# Add API call duration tracking to visual-ai-assertions

## Problem

The library tracked token usage (`inputTokens`, `outputTokens`) and estimated cost per API call, but had no way to report **wall-clock time** for each call. Users running visual AI assertions in CI pipelines or E2E test suites had no visibility into how long each provider round-trip actually took, making it difficult to identify slow checks, set timeouts, or track performance regressions.

The existing `UsageInfo` type only carried token counts and an optional cost estimate. There was no timing instrumentation anywhere in the call path. Additionally, `processUsage()` returned `UsageInfo | undefined`, meaning that when a provider omitted usage data entirely, no usage object was returned at all -- so there was no place to attach timing information even if it were collected.

## Solution

### Step 1: Schema change

Added `durationSeconds` as an optional nonnegative number to `UsageInfoSchema`:

```typescript
// src/types.ts
export const UsageInfoSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  estimatedCost: z.number().optional(),
  durationSeconds: z.number().nonnegative().optional(),
});
```

The field is optional so existing serialized results without it remain valid (backward compatibility).

### Step 2: `timedSendMessage()` helper

A new private helper wraps the provider's `sendMessage()` call with `performance.now()` bookends:

```typescript
// src/core/client.ts
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

The return type is an intersection (`RawProviderResponse & { durationSeconds: number }`) so callers get the original response fields plus the timing.

### Step 3: `processUsage()` always returns `UsageInfo`

Changed from returning `UsageInfo | undefined` to always returning a `UsageInfo` object, defaulting tokens to 0 when the provider omits usage data:

```typescript
// src/core/client.ts
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

### Step 4: Updated `usageLog()` to include duration

```typescript
// src/core/client.ts
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

### Step 5: All 8 client methods updated

Every method (`check`, `query`, `compare`, `missingElements`, `accessibility`, `layout`, `pageLoad`, `content`) changed from calling `driver.sendMessage()` directly to calling `timedSendMessage()`, passing `response.durationSeconds` through to `processUsage()`.

## Key Design Decisions

| Decision                                     | Rationale                                                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Client-layer timing, not provider-layer      | Users care about API latency, not local image processing. Avoids modifying three provider files and duplicating logic. |
| `performance.now()` over `Date.now()`        | Monotonic clock immune to system clock adjustments. Sub-millisecond precision.                                         |
| Always return `UsageInfo`, never `undefined` | Guarantees `durationSeconds` is always available even when providers omit token counts.                                |
| Schema field is `.optional()`                | Backward compatibility with existing serialized data.                                                                  |
| `.nonnegative()` Zod constraint              | Catches bugs where negative duration might slip through (VM snapshots, buggy polyfills).                               |
| `Math.round(...) / 1000` rounding            | Millisecond precision avoids false precision from floating-point noise.                                                |

## Prevention & Best Practices

### Extending UsageInfo with new metrics

Follow this checklist whenever adding a new observability field:

- [ ] Add the field to the Zod schema with `.optional()` for backward compatibility
- [ ] Populate the field in `processUsage()` with a sensible default when the provider does not supply it
- [ ] Update `timedSendMessage()` if the metric is client-measured (like duration) rather than provider-reported (like tokens)
- [ ] Add a dedicated unit test for the default value and the real value
- [ ] Update smoke tests to assert the new field is present and plausible
- [ ] Always extend from the shared helper -- never inline instrumentation in individual methods

### Testing time-dependent code

- Mock `performance.now()` with `vi.spyOn(performance, 'now')`, not global replacement
- Use `mockReturnValueOnce` chains for deterministic start/end timestamps
- Test the edge case where start and end are equal (duration of exactly `0`)
- Do not use `vi.useFakeTimers()` for `performance.now()` -- its behavior is not guaranteed across environments
- Use range assertions in smoke tests: `> 0` and `< 30` rather than exact values

## Gotchas to Avoid

- **`performance.now()` returns milliseconds** -- the `/1000` conversion is a common source of off-by-1000 errors. Be explicit about units in field names (`durationSeconds`, not `duration`).
- **Timing across `await` includes event loop idle time** -- this measures wall-clock time, not CPU time. Network latency, DNS, and TLS are all included.
- **Making an optional field required is a breaking change** -- even if the runtime always populates it, keep the schema permissive for serialized data consumers.
- **Provider-specific usage quirks** -- OpenAI Responses API reports usage differently from Chat Completions; Anthropic may include cache tokens separately; Google Gemini may omit usage on streaming responses. Always normalize in the provider driver.
- **Default values change meaning** -- `inputTokens: 0` cannot distinguish "provider said zero" from "provider did not report." Document the semantics.

## Testing Strategy

| Test Layer                                                    | What It Validates                             | Key Technique                                                     |
| ------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| Schema tests (`tests/types.test.ts`)                          | Zod accepts/rejects `durationSeconds` values  | Direct `parse()` / `toThrow()`                                    |
| Client unit tests (`tests/core/client.test.ts`)               | Exact duration computation, stderr formatting | `vi.spyOn(performance, 'now')` with chained `mockReturnValueOnce` |
| Template method tests (`tests/core/client-templates.test.ts`) | All 5 template methods include duration       | Loop over method names                                            |
| Integration tests (`tests/integration/full-flow.test.ts`)     | Duration present in all 3 provider flows      | Mock SDK assertions                                               |
| Smoke tests (`tests/smoke/*.smoke.test.ts`)                   | Real API duration is positive and reasonable  | `> 0` and `< 30` range assertions                                 |

## Related Documentation

- [Per-call API cost monitoring](./per-call-api-cost-monitoring.md) -- Predecessor pattern for `processUsage()`, `usageLog()`, `UsageInfoSchema`
- [Composable prompt blocks and API consistency](./composable-prompt-blocks-and-api-consistency.md) -- `BaseResultSchema` composition with `UsageInfoSchema`
- [Type safety and code deduplication review](./type-safety-and-code-deduplication-review.md) -- `ProviderName` typing on `calculateCost()`
- [API integration bugs undetectable by mocked tests](../integration-issues/api-integration-bugs-undetectable-by-mocked-tests.md) -- Smoke test strategy and tiered assertions
- [Duration tracking plan](../../plans/2026-03-09-feat-api-call-duration-tracking-plan.md) -- Original implementation plan
- [API cost monitoring brainstorm](../../brainstorms/2026-02-16-api-cost-monitoring-brainstorm.md) -- Established "per-call observability only" philosophy
