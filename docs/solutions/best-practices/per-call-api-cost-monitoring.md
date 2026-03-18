---
title: "Per-call API token and cost monitoring"
date: 2026-02-16
category: best-practices
tags:
  - cost-monitoring
  - token-usage
  - api-pricing
  - observability
  - stderr-logging
  - usage-tracking
component:
  - src/core/pricing.ts
  - src/core/debug.ts
  - src/constants.ts
  - src/types.ts
severity: medium
problem_type: feature_implementation
search_keywords:
  - api cost tracking
  - token usage monitoring
  - estimatedCost
  - trackUsage
  - pricing table
  - per-call cost
  - usage logging stderr
  - calculateCost
  - UsageInfo
  - UsageInfoSchema
---

# Per-Call API Token and Cost Monitoring

## Problem

Users running visual AI assertions in E2E test suites had no visibility into the dollar cost of each API call. The library already tracked raw token counts (`inputTokens`/`outputTokens`) in results, but never translated them into estimated USD amounts. No logging of usage data appeared during test runs. Teams had no way to detect cost spikes without checking provider billing dashboards after the fact.

## Solution

Client-layer cost calculation using a hardcoded pricing lookup table. After every `driver.sendMessage()` call, the client computes `estimatedCost` from the provider/model and token counts, logs it to stderr (when enabled), and attaches it to the result's `usage` field.

Three components:

1. **Pricing module** (`src/core/pricing.ts`) - Maps `"provider:model"` keys (using `Provider`/`Model` constants from `src/constants.ts`) to per-token prices. Pure function `calculateCost()` returns `number | undefined`.
2. **Type changes** (`src/types.ts`) - Extracted `UsageInfoSchema` with optional `estimatedCost` and `durationSeconds`. Added `trackUsage` config flag.
3. **Debug wiring** (`src/core/debug.ts`) - `processUsage()` helper centralizes cost calculation and logging for all client methods.

## Key Code

### Pricing table and calculation

```typescript
// src/core/pricing.ts
import { Model, Provider } from "../constants.js";

const PER_MILLION = 1_000_000;

const PRICING_TABLE: Record<string, ModelPricing> = {
  [`${Provider.ANTHROPIC}:${Model.Anthropic.OPUS_4_6}`]: {
    inputPricePerToken: 5 / PER_MILLION,
    outputPricePerToken: 25 / PER_MILLION,
  },
  [`${Provider.ANTHROPIC}:${Model.Anthropic.SONNET_4_6}`]: {
    inputPricePerToken: 3 / PER_MILLION,
    outputPricePerToken: 15 / PER_MILLION,
  },
  [`${Provider.ANTHROPIC}:${Model.Anthropic.HAIKU_4_5}`]: {
    inputPricePerToken: 1 / PER_MILLION,
    outputPricePerToken: 5 / PER_MILLION,
  },
  [`${Provider.OPENAI}:${Model.OpenAI.GPT_5_4}`]: {
    /* ... */
  },
  [`${Provider.OPENAI}:${Model.OpenAI.GPT_5_4_PRO}`]: {
    /* ... */
  },
  [`${Provider.OPENAI}:${Model.OpenAI.GPT_5_4_MINI}`]: {
    /* ... */
  },
  [`${Provider.OPENAI}:${Model.OpenAI.GPT_5_4_NANO}`]: {
    /* ... */
  },
  [`${Provider.OPENAI}:${Model.OpenAI.GPT_5_2}`]: {
    /* ... */
  },
  [`${Provider.OPENAI}:${Model.OpenAI.GPT_5_MINI}`]: {
    /* ... */
  },
  [`${Provider.GOOGLE}:${Model.Google.GEMINI_3_1_PRO_PREVIEW}`]: {
    /* ... */
  },
  [`${Provider.GOOGLE}:${Model.Google.GEMINI_3_FLASH_PREVIEW}`]: {
    /* ... */
  },
};

export function calculateCost(
  provider: ProviderName,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | undefined {
  const key = `${provider}:${model}`;
  const pricing = PRICING_TABLE[key];
  if (!pricing) return undefined;
  return inputTokens * pricing.inputPricePerToken + outputTokens * pricing.outputPricePerToken;
}
```

### Usage processing

```typescript
// src/core/debug.ts
export function processUsage(
  method: string,
  rawUsage: RawProviderResponse["usage"],
  durationSeconds: number,
  config: ResolvedConfig,
): UsageInfo {
  const inputTokens = rawUsage?.inputTokens ?? 0;
  const outputTokens = rawUsage?.outputTokens ?? 0;
  const usage: UsageInfo = {
    inputTokens,
    outputTokens,
    estimatedCost: calculateCost(config.provider, config.model, inputTokens, outputTokens),
    durationSeconds,
  };
  usageLog(config, method, usage);
  return usage;
}
```

### Stderr logging with opt-in

```typescript
// src/core/debug.ts
export function usageLog(config: ResolvedConfig, method: string, usage: UsageInfo): void {
  if (!config.trackUsage) return;
  const costStr =
    usage.estimatedCost !== undefined ? `$${usage.estimatedCost.toFixed(6)}` : "unknown";
  process.stderr.write(
    `[visual-ai-assertions] ${method} usage: ${usage.inputTokens} input + ${usage.outputTokens} output tokens (${costStr}) in ${usage.durationSeconds?.toFixed(3) ?? "0.000"}s [${config.model}]\n`,
  );
}
```

## Architecture Decisions

| Decision                                              | Rationale                                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Client-layer calculation** (not provider-layer)     | Providers remain thin SDK wrappers. One pricing table serves all providers. The client has `config.provider` and `config.model` in scope.  |
| **`undefined` for unknown models** (not throw, not 0) | Cost estimation is informational, not critical. `0` implies "free." `undefined` means "unknown." Never blocks the user's primary workflow. |
| **stderr logging** (not callbacks)                    | E2E test runners already capture stderr. Zero-config. No handler wiring needed.                                                            |
| **`!config.trackUsage` guard** (default off)          | Usage logging is off by default. Users must explicitly set `trackUsage: true` to opt in.                                                   |

## Maintenance Considerations

### Pricing table updates

When adding new models or updating prices, three locations must stay in sync:

1. `PRICING_TABLE` in `src/core/pricing.ts` - the pricing entries
2. `DEFAULT_MODELS` in `src/constants.ts` - the default model per provider
3. Driver constructors in `src/providers/*.ts` - the fallback model string

Add a corresponding test in `tests/core/pricing.test.ts` for each new entry with inline arithmetic comments showing the expected calculation.

### Floating point in tests

Pricing math uses very small floats. Always use `toBeCloseTo(expected, 10)` in tests, never strict `toBe` equality.

### stderr spy lifecycle

Tests that spy on `process.stderr.write` must call `stderrSpy.mockRestore()` after assertions. A missing restore breaks stderr for subsequent tests.

## Common Pitfalls

1. **Default model mismatch** - `DEFAULT_MODELS` in `src/constants.ts`, driver constructor defaults, and `PRICING_TABLE` keys must all use the exact same model string (via `Provider`/`Model` constants). A mismatch causes silent `undefined` cost.
2. **`trackUsage` semantics** - `undefined`/`false` means logging is off (default). The guard is `!config.trackUsage`, so users must explicitly set `trackUsage: true` to enable logging.
3. **Usage always returned** - `processUsage` now always returns a `UsageInfo` object (never `undefined`), defaulting token counts to 0 when the provider omits them. New providers do not need special handling for missing usage.

## Patterns Established

- **Pure functions for derived metrics** - `calculateCost` has no side effects, making it trivially testable.
- **Separation of calculation from I/O** - Cost math and stderr logging are separate functions orchestrated by `processUsage`.
- **Graceful degradation for non-critical data** - Unknown models return `undefined`, not errors.
- **Config flag convention** - `trackUsage` is a boolean on config, default off. Checked with `!config.trackUsage`.
- **Zod validation for all returned data** - `UsageInfoSchema` validates usage including `estimatedCost` and `durationSeconds`.

## Future Extension Points (Do Not Build Yet)

- **Cumulative tracking** - `processUsage` closure could maintain running totals. Wait for user demand.
- **Custom pricing overrides** - `config.customPricing` could override built-in table. Wait for enterprise use case.
- **Usage callback hook** - `config.onUsage` callback for programmatic handling. Stderr is sufficient for now.
- **Cost budgeting** - Pre-call cost estimation and rejection. Fundamentally different problem from post-call reporting.

## Testing Guidance

| Test Category       | Pattern                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Pricing calculation | One test per model with inline arithmetic comment. Test unknown model/provider returns `undefined`. Test zero tokens returns 0. |
| Usage logging       | Test default logging happens, explicit `false` suppresses it, independence from `debug` flag.                                   |
| Cost in results     | Test known model has `estimatedCost` as number, unknown model has `undefined`.                                                  |
| Integration         | Use `toMatchObject` for token counts + `toBeTypeOf("number")` for cost (avoids coupling to prices).                             |

## Related Documents

- Brainstorm: `docs/brainstorms/2026-02-16-api-cost-monitoring-brainstorm.md`
- Plan: `docs/plans/2026-02-16-feat-api-cost-monitoring-plan.md`
- Original library plan: `docs/plans/2026-02-16-feat-visual-ai-assertions-library-plan.md` (defined `CheckResult`/`QueryResult` and debug logging pattern)
- Build configuration: `docs/solutions/build-errors/typescript-library-build-configuration.md`
