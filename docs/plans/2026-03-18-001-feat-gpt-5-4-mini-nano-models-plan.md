---
title: "feat: Add GPT-5.4 mini and nano model support"
type: feat
status: active
date: 2026-03-18
---

# feat: Add GPT-5.4 mini and nano model support

## Overview

Add support for OpenAI's newly released `gpt-5.4-mini` and `gpt-5.4-nano` models. Update the default OpenAI model from `gpt-5-mini` to `gpt-5.4-mini`, reflecting the natural successor with significantly improved capabilities for visual reasoning tasks.

## Problem Statement / Motivation

OpenAI released GPT-5.4 mini and nano on 2026-03-17. These models offer substantial improvements over the previous generation:

- **gpt-5.4-mini**: 2x faster than gpt-5-mini, better coding/reasoning/vision, 400k context window. $0.75/M input, $4.50/M output.
- **gpt-5.4-nano**: Cheapest/fastest option for high-throughput, low-latency tasks. $0.20/M input, $1.25/M output.

Users should be able to use these models, and the default should reflect the best general-purpose option.

## Proposed Solution

Add both model IDs to the existing `Model.OpenAI` constant object, add pricing entries, and update the default. This follows the exact same pattern used for all existing models — no new abstractions needed.

## Acceptance Criteria

- [ ] `Model.OpenAI.GPT_5_4_MINI` constant equals `"gpt-5.4-mini"`
- [ ] `Model.OpenAI.GPT_5_4_NANO` constant equals `"gpt-5.4-nano"`
- [ ] `DEFAULT_MODELS[Provider.OPENAI]` changed to `Model.OpenAI.GPT_5_4_MINI`
- [ ] Pricing table includes both new models with correct rates
- [ ] `MODEL_TO_PROVIDER` automatically includes new models (derived from `Model.OpenAI`)
- [ ] Model prefix detection (`"gpt-"` prefix) already covers these — no config.ts changes needed
- [ ] All existing tests updated to reflect new defaults and model entries
- [ ] New pricing tests for both models
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` passes

## Implementation Steps

### Step 1: `src/constants.ts`

Add two entries to `Model.OpenAI`:

```typescript
// src/constants.ts — Model.OpenAI object
OpenAI: {
  GPT_5_4: "gpt-5.4",
  GPT_5_4_PRO: "gpt-5.4-pro",
  GPT_5_4_MINI: "gpt-5.4-mini",    // NEW
  GPT_5_4_NANO: "gpt-5.4-nano",    // NEW
  GPT_5_2: "gpt-5.2",
  GPT_5_MINI: "gpt-5-mini",
},
```

Update the default:

```typescript
// src/constants.ts — DEFAULT_MODELS
[Provider.OPENAI]: Model.OpenAI.GPT_5_4_MINI,
```

Note: `MODEL_TO_PROVIDER` and `KnownModelName` are derived automatically — no manual changes needed.

### Step 2: `src/core/pricing.ts`

Add two pricing entries:

```typescript
// src/core/pricing.ts
[`${Provider.OPENAI}:${Model.OpenAI.GPT_5_4_MINI}`]: {
  inputPricePerToken: 0.75 / PER_MILLION,
  outputPricePerToken: 4.5 / PER_MILLION,
},
[`${Provider.OPENAI}:${Model.OpenAI.GPT_5_4_NANO}`]: {
  inputPricePerToken: 0.2 / PER_MILLION,
  outputPricePerToken: 1.25 / PER_MILLION,
},
```

### Step 3: `src/core/config.ts`

No changes needed. The `"gpt-"` prefix in `MODEL_PREFIX_TO_PROVIDER` already covers `gpt-5.4-mini` and `gpt-5.4-nano`.

### Step 4: Update tests

**`tests/constants.test.ts`:**

- Add assertions for `Model.OpenAI.GPT_5_4_MINI` and `GPT_5_4_NANO` values
- Update `DEFAULT_MODELS` test: OpenAI default → `GPT_5_4_MINI`

**`tests/core/pricing.test.ts`:**

- Add cost calculation tests for both new models

**`tests/core/config.test.ts`:**

- Update the default config test that uses `"gpt-5-mini"` to use `"gpt-5.4-mini"` where it references the default

## Files Changed

| File                         | Change                                    |
| ---------------------------- | ----------------------------------------- |
| `src/constants.ts`           | Add 2 model constants, update default     |
| `src/core/pricing.ts`        | Add 2 pricing entries                     |
| `tests/constants.test.ts`    | Add model assertions, update default test |
| `tests/core/pricing.test.ts` | Add pricing tests for new models          |
| `tests/core/config.test.ts`  | Update default model references           |

## Sources

- [OpenAI GPT-5.4 mini announcement](https://openai.com/index/introducing-gpt-5-4-mini-and-nano/)
- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- [GPT-5.4 mini model docs](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
