---
title: "Consolidate magic strings into typed constants with `as const satisfies`"
category: best-practices
problem_type: developer-experience
component: constants, client, pricing, providers
symptoms:
  - Magic strings scattered across multiple files
  - No autocomplete for provider or model names
  - Easy to typo provider/model strings with no compile-time error
  - Library consumers must guess valid values
root_cause: No single source of truth for provider and model string literals
solution: Extract constants into `src/constants.ts` using `as const satisfies` pattern
date: 2026-03-09
tags:
  - typescript
  - as-const-satisfies
  - developer-experience
  - constants
  - type-safety
  - YAGNI
---

# Consolidate Magic Strings into Typed Constants

## Problem

Provider names (`"anthropic"`, `"openai"`, `"google"`) and model identifiers (`"claude-sonnet-4-6"`, `"gpt-5-mini"`, etc.) were hardcoded as string literals across four locations:

- `src/core/client.ts` — `VALID_PROVIDERS` array and `DEFAULT_MODELS` map
- `src/core/pricing.ts` — pricing table keys like `"anthropic:claude-sonnet-4-6"`
- `src/providers/*.ts` — fallback model defaults in each driver constructor

Library consumers had no way to discover valid values without reading source code or docs.

## Root Cause

No single source of truth existed for provider and model string literals. Each file independently defined its own magic strings, creating:

1. **Duplication** — same strings in 4+ files
2. **No discoverability** — consumers must guess valid values
3. **No compile-time safety** — typos silently pass type checks since `ClientConfig.model` is `string`

## Solution

### 1. Created `src/constants.ts` as single source of truth

```typescript
import type { ProviderName } from "./types.js";

export const Provider = {
  ANTHROPIC: "anthropic",
  OPENAI: "openai",
  GOOGLE: "google",
} as const satisfies Record<string, ProviderName>;

export const Model = {
  Anthropic: {
    OPUS_4_6: "claude-opus-4-6",
    SONNET_4_6: "claude-sonnet-4-6",
    HAIKU_4_5: "claude-haiku-4-5",
  },
  OpenAI: {
    GPT_5_2: "gpt-5.2",
    GPT_5_MINI: "gpt-5-mini",
  },
  Google: {
    GEMINI_3_1_PRO_PREVIEW: "gemini-3.1-pro-preview",
    GEMINI_3_FLASH_PREVIEW: "gemini-3-flash-preview",
    GEMINI_2_5_FLASH: "gemini-2.5-flash",
  },
} as const;

export type KnownModelName =
  | (typeof Model.Anthropic)[keyof typeof Model.Anthropic]
  | (typeof Model.OpenAI)[keyof typeof Model.OpenAI]
  | (typeof Model.Google)[keyof typeof Model.Google];

export const DEFAULT_MODELS = {
  [Provider.ANTHROPIC]: Model.Anthropic.SONNET_4_6,
  [Provider.OPENAI]: Model.OpenAI.GPT_5_MINI,
  [Provider.GOOGLE]: Model.Google.GEMINI_2_5_FLASH,
} as const satisfies Record<ProviderName, KnownModelName>;

export const VALID_PROVIDERS: readonly ProviderName[] = Object.values(Provider);
```

### 2. Replaced all magic strings in consumers

- **`src/core/client.ts`** — removed internal `VALID_PROVIDERS`/`DEFAULT_MODELS`, imported from constants
- **`src/core/pricing.ts`** — replaced hardcoded keys with template literals: `` `${Provider.ANTHROPIC}:${Model.Anthropic.OPUS_4_6}` ``
- **`src/providers/anthropic.ts`** — `Model.Anthropic.SONNET_4_6` instead of `"claude-sonnet-4-6"`
- **`src/providers/openai.ts`** — `Model.OpenAI.GPT_5_MINI` instead of `"gpt-5-mini"`
- **`src/providers/google.ts`** — `Model.Google.GEMINI_2_5_FLASH` instead of `"gemini-2.5-flash"`

### 3. Exported from public API

```typescript
// src/index.ts
export { Provider, Model, DEFAULT_MODELS, VALID_PROVIDERS } from "./constants.js";
export type { KnownModelName } from "./constants.js";
```

### 4. Consumer usage

```typescript
import { createClient, Provider, Model } from "visual-ai-assertions";

const client = createClient({
  provider: Provider.ANTHROPIC,
  model: Model.Anthropic.SONNET_4_6,
});
```

## Design Decisions

| Decision                                        | Rationale                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `as const` objects over `enum`                  | Better tree-shaking, no runtime overhead, idiomatic modern TS                       |
| `as const satisfies Record<K, V>`               | Preserves literal types AND enforces structural validation at compile time          |
| Models grouped by provider                      | `Model.Anthropic.SONNET_4_6` gives clear namespacing and good autocomplete          |
| `ClientConfig.model` stays `string`             | Keeps flexibility for custom/preview models not yet in constants                    |
| `KnownModelName` as single union                | YAGNI — per-provider types (`AnthropicModelName` etc.) had no consumer              |
| One-directional imports                         | `constants.ts` imports type from `types.ts`, never reverse — prevents circular deps |
| `ProviderName` stays manual union in `types.ts` | Avoids circular dependency; `constants.ts` validates against it via `satisfies`     |

## Key Lessons

1. **`as const satisfies` is the gold standard** for typed constant objects — it preserves literal types while enforcing structural contracts at compile time.

2. **Derive types from constants, not the reverse.** `KnownModelName` is derived from `typeof Model.*` values, so adding a model to the object automatically updates the union.

3. **YAGNI applies to types too.** Initial implementation exported per-provider model types (`AnthropicModelName`, `OpenAIModelName`, `GoogleModelName`). Code review correctly identified these as dead exports with no consumer — they were removed.

4. **`as const` without `satisfies` loses validation.** The `Model` object uses only `as const` (no `satisfies`) because there's no single Record type that captures the nested provider→model structure. That's fine — the `DEFAULT_MODELS` object cross-validates via `satisfies Record<ProviderName, KnownModelName>`.

5. **Watch for type widening in `satisfies`.** The initial `DEFAULT_MODELS` was typed as `Record<ProviderName, string>` which lost literal types. Changing to `satisfies Record<ProviderName, KnownModelName>` preserved them.

6. **Template literals maintain the constants pattern.** In pricing.ts, `` `${Provider.ANTHROPIC}:${Model.Anthropic.OPUS_4_6}` `` is more verbose than `"anthropic:claude-opus-4-6"` but ensures the pricing table stays in sync when constants change.

## Prevention Strategies

- When adding a new model: add it to `Model.*` in `constants.ts`, add pricing in `pricing.ts` using the constant, and TypeScript will catch any `satisfies` mismatches.
- When adding a new provider: add to both `ProviderName` union in `types.ts` and `Provider` object in `constants.ts` — the `satisfies` constraint will flag if they diverge.
- Run `pnpm typecheck` — the `satisfies` constraints catch mismatches at compile time, no runtime test needed.

## Related Documentation

- [type-safety-and-code-deduplication-review.md](type-safety-and-code-deduplication-review.md) — Earlier review that identified type safety patterns
- [api-call-duration-tracking.md](api-call-duration-tracking.md) — Duration tracking added in same branch
- [composable-prompt-blocks-and-api-consistency.md](composable-prompt-blocks-and-api-consistency.md) — Prompt block architecture this builds on

## Verification

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

All 258 tests pass. No breaking changes to public API.
