---
title: "feat: Add per-call API token and cost monitoring"
type: feat
status: completed
date: 2026-02-16
brainstorm: docs/brainstorms/2026-02-16-api-cost-monitoring-brainstorm.md
---

# feat: Add per-call API token and cost monitoring

## Overview

Add per-call cost visibility to visual-ai-assertions. After each API call, the library will calculate the estimated USD cost from token counts and hardcoded model pricing, log it to stderr (when enabled), and include it in the result object.

## Problem Statement / Motivation

Users running visual AI assertions in E2E test suites have no visibility into what each call costs. The library already tracks token counts (`inputTokens`/`outputTokens`) but doesn't translate them into dollars. Without cost awareness, test suites can silently accumulate unexpected API spend.

## Proposed Solution

Client-layer cost calculation using a pricing lookup table. After each `driver.sendMessage()` call, the client computes `estimatedCost` from the provider/model and token counts, logs to stderr if `trackUsage` is enabled, and attaches the cost to the result's `usage` field.

## Technical Considerations

- **Model name is in ClientConfig, not in provider responses** - The client already has `config.provider` and `config.model` (or defaults). No changes to `ProviderDriver` or `RawProviderResponse` needed.
- **Usage can be undefined** - OpenAI and Google drivers return `undefined` when the API omits usage metadata. Cost must gracefully handle this (return `undefined`, skip logging).
- **Unknown models** - Users can pass custom model strings not in the pricing table. `estimatedCost` should be `undefined` for unknown models rather than 0 (which implies "free").
- **Pricing staleness** - Hardcoded prices will go stale as providers change pricing. This is acceptable per brainstorm decision; prices update with library releases.

## Acceptance Criteria

- [x] New `trackUsage` option in `ClientConfig` (default: `true`)
- [x] New `src/core/pricing.ts` with pricing lookup for default models
- [x] `estimatedCost` (number | undefined) added to `usage` on `CheckResult` and `QueryResult`
- [x] Stderr logging of tokens + estimated cost per call when `trackUsage: true`
- [x] Logging skipped when usage is undefined or `trackUsage: false`
- [x] Unknown models produce `undefined` for `estimatedCost` (not 0)
- [x] Exported `UsageInfo` type and `UsageInfoSchema` from public API
- [x] Tests for pricing calculation, logging behavior, and edge cases
- [x] All existing tests pass unchanged
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` passes

## Implementation Plan

### Phase 1: Types and pricing table

**`src/core/pricing.ts`** (new file)

```typescript
// Per-token pricing in USD
interface ModelPricing {
  inputPricePerToken: number;
  outputPricePerToken: number;
}

// Lookup: `${provider}:${model}` -> pricing
const PRICING_TABLE: Record<string, ModelPricing> = {
  "anthropic:claude-sonnet-4-5-20250929": {
    inputPricePerToken: 3 / 1_000_000, // $3 per 1M input tokens
    outputPricePerToken: 15 / 1_000_000, // $15 per 1M output tokens
  },
  "openai:gpt-4o": {
    inputPricePerToken: 2.5 / 1_000_000,
    outputPricePerToken: 10 / 1_000_000,
  },
  "google:gemini-2.0-flash": {
    inputPricePerToken: 0.1 / 1_000_000,
    outputPricePerToken: 0.4 / 1_000_000,
  },
};

export function calculateCost(
  provider: string,
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

**`src/types.ts`** changes:

- Extract inline usage object into a standalone `UsageInfoSchema` / `UsageInfo` type
- Add optional `estimatedCost: z.number().optional()` to the usage schema
- Add `trackUsage?: boolean` to `ClientConfig` (default handled in client)

```typescript
// New standalone schema (replaces inline usage objects)
export const UsageInfoSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  estimatedCost: z.number().optional(),
});
export type UsageInfo = z.infer<typeof UsageInfoSchema>;
```

Update `CheckResultSchema` and `QueryResultSchema` to use `UsageInfoSchema.optional()` instead of the inline object.

### Phase 2: Client integration

**`src/core/client.ts`** changes:

- Import `calculateCost` from `./pricing.js`
- Add a `usageLog` helper (similar pattern to existing `debugLog`):

```typescript
function usageLog(
  config: ClientConfig,
  method: string,
  usage: { inputTokens: number; outputTokens: number },
  estimatedCost: number | undefined,
): void {
  if (config.trackUsage === false) return;
  const costStr = estimatedCost !== undefined ? `$${estimatedCost.toFixed(6)}` : "unknown";
  process.stderr.write(
    `[visual-ai-assertions] ${method} usage: ${usage.inputTokens} input + ${usage.outputTokens} output tokens (${costStr})\n`,
  );
}
```

- In each method, after getting `response` from `driver.sendMessage()`, compute cost and log:

```typescript
const estimatedCost = response.usage
  ? calculateCost(
      config.provider,
      config.model ?? DEFAULT_MODEL,
      response.usage.inputTokens,
      response.usage.outputTokens,
    )
  : undefined;

if (response.usage) {
  usageLog(config, "check", response.usage, estimatedCost);
}

return { ...result, usage: response.usage ? { ...response.usage, estimatedCost } : undefined };
```

- Resolve default model per provider (needed for pricing lookup when `config.model` is undefined). Add a constant map:

```typescript
const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-5-20250929",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
};
```

### Phase 3: Public API exports

**`src/index.ts`** changes:

- Export `UsageInfo` type and `UsageInfoSchema` from the types section

### Phase 4: Tests

**`tests/core/pricing.test.ts`** (new file):

- [x] Known model returns correct cost calculation
- [x] Unknown model returns `undefined`
- [x] Zero tokens returns 0 cost
- [x] Each default model in the pricing table is testable

**`tests/core/client.test.ts`** (modify existing):

- [x] `trackUsage: true` (default) logs to stderr with token counts and cost
- [x] `trackUsage: false` suppresses usage logging
- [x] `estimatedCost` is present in result.usage when model is known
- [x] `estimatedCost` is undefined when model is unknown
- [x] `usage` is undefined when provider returns no usage (existing behavior preserved)
- [x] Debug logging and usage logging are independent (debug: false + trackUsage: true works)

**`tests/types.test.ts`** (modify existing):

- [x] `UsageInfoSchema` validates with and without `estimatedCost`
- [x] `CheckResultSchema` and `QueryResultSchema` accept the new usage shape

**`tests/index.test.ts`** (modify existing):

- [x] `UsageInfo` and `UsageInfoSchema` are exported

## Files Changed

| File                         | Action | Description                                                                |
| ---------------------------- | ------ | -------------------------------------------------------------------------- |
| `src/core/pricing.ts`        | Create | Pricing table + `calculateCost()`                                          |
| `src/types.ts`               | Modify | Extract `UsageInfoSchema`, add `estimatedCost`, add `trackUsage` to config |
| `src/core/client.ts`         | Modify | Cost calculation, usage logging, default model map                         |
| `src/index.ts`               | Modify | Export `UsageInfo`, `UsageInfoSchema`                                      |
| `tests/core/pricing.test.ts` | Create | Pricing calculation tests                                                  |
| `tests/core/client.test.ts`  | Modify | Usage logging + cost in results tests                                      |
| `tests/types.test.ts`        | Modify | New schema validation tests                                                |
| `tests/index.test.ts`        | Modify | Export presence tests                                                      |

## Dependencies & Risks

- **No new dependencies** - Pure TypeScript math + existing Zod
- **Pricing accuracy** - Hardcoded prices may not match current provider pricing; documented as a known limitation
- **Breaking change risk: LOW** - `estimatedCost` is optional on usage, `trackUsage` defaults to true. Existing code sees new stderr output but results remain backward-compatible.
- **The only user-visible change without opt-in** is stderr logging (since `trackUsage` defaults to true). Users who pipe stderr may notice new output.

## References & Research

- Brainstorm: `docs/brainstorms/2026-02-16-api-cost-monitoring-brainstorm.md`
- Existing usage flow: `src/providers/types.ts:3-9` (RawProviderResponse)
- Client pattern: `src/core/client.ts:67-163` (all 8 methods spread usage)
- Debug log pattern: `src/core/client.ts:54-58`
- Types: `src/types.ts:39-65` (CheckResult/QueryResult with inline usage)
- Public exports: `src/index.ts`
