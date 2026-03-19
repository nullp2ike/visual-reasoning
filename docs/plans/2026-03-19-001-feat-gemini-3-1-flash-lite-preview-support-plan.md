---
title: "feat: Add Gemini 3.1 Flash Lite Preview model support"
type: feat
status: completed
date: 2026-03-19
---

# feat: Add Gemini 3.1 Flash Lite Preview model support

## Overview

Register `gemini-3.1-flash-lite-preview` as a first-class known model in the library. This is Google's cost-optimized variant of Gemini Flash — 50% cheaper across the board, with full vision/multimodal input and thinking/reasoning support.

## Problem Statement / Motivation

The library currently supports two Google models (`gemini-3.1-pro-preview`, `gemini-3-flash-preview`). Gemini 3.1 Flash Lite Preview offers a compelling budget option for high-volume visual assertions where cost matters more than maximum reasoning depth. Without registering it, users can still pass the model string manually, but they lose typed constants, autocomplete, pricing/cost tracking, and `MODEL_TO_PROVIDER` exact lookup.

## Proposed Solution

Minimal, mechanical model registration following the established pattern (same as the GPT-5.4 mini/nano addition in `2026-03-18-001`). No driver changes needed — the Google driver is model-agnostic.

## Technical Considerations

### What works automatically (no changes needed)

- **Provider inference**: `"gemini-"` prefix already maps to `google` in `src/core/config.ts`
- **Google driver**: Passes model string through to API unchanged (`src/providers/google.ts`)
- **`needsCodeExecution()`**: Regex `/^gemini-(\d+)/` captures `"3"` from `"gemini-3.1-flash-lite-preview"` → `3 >= 3` is `true` ✓
- **Reasoning effort**: Flash Lite supports thinking with levels `minimal`, `low`, `medium`, `high`. The existing `GOOGLE_THINKING_BUDGET` map works as-is

### What needs explicit changes

| File                         | Change                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `src/constants.ts:29-32`     | Add `GEMINI_3_1_FLASH_LITE_PREVIEW: "gemini-3.1-flash-lite-preview"` to `Model.Google` |
| `src/core/pricing.ts`        | Add pricing entry: input $0.25/M, output $1.50/M                                       |
| `tests/constants.test.ts`    | Add model value assertion                                                              |
| `tests/core/pricing.test.ts` | Add cost calculation test with `toBeCloseTo`                                           |

### AI diff image generation

The lite model should **NOT** be added to the diff image allowlist. The current hard-coded check in `src/core/diff.ts:30` restricts diff generation to `gemini-3-flash-preview` only, and this is correct — lite models are optimized for throughput, not complex image generation tasks.

### Default model

No change to `DEFAULT_MODELS`. The current Google default remains `gemini-3-flash-preview`. Flash Lite is an opt-in budget alternative.

## Acceptance Criteria

- [ ] `Model.Google.GEMINI_3_1_FLASH_LITE_PREVIEW` constant exists with value `"gemini-3.1-flash-lite-preview"`
- [ ] `MODEL_TO_PROVIDER` maps the new model to `"google"` (automatic via `Object.values`)
- [ ] `KnownModelName` union includes the new model (automatic via type derivation)
- [ ] `PRICING_TABLE` has entry with input: `0.25 / PER_MILLION`, output: `1.50 / PER_MILLION`
- [ ] `calculateCost("google", "gemini-3.1-flash-lite-preview", ...)` returns correct values
- [ ] Constants test verifies the model value
- [ ] Pricing test verifies cost calculation with `toBeCloseTo`
- [ ] All existing tests pass unchanged
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` passes

## MVP

### src/constants.ts

```typescript
Google: {
  GEMINI_3_1_PRO_PREVIEW: "gemini-3.1-pro-preview",
  GEMINI_3_1_FLASH_LITE_PREVIEW: "gemini-3.1-flash-lite-preview",
  GEMINI_3_FLASH_PREVIEW: "gemini-3-flash-preview",
},
```

### src/core/pricing.ts

```typescript
[`${Provider.GOOGLE}:${Model.Google.GEMINI_3_1_FLASH_LITE_PREVIEW}`]: {
  inputPricePerToken: 0.25 / PER_MILLION,
  outputPricePerToken: 1.5 / PER_MILLION,
},
```

### tests/constants.test.ts

```typescript
expect(Model.Google.GEMINI_3_1_FLASH_LITE_PREVIEW).toBe("gemini-3.1-flash-lite-preview");
```

### tests/core/pricing.test.ts

```typescript
it("calculates cost for gemini-3.1-flash-lite-preview", () => {
  const cost = calculateCost("google", "gemini-3.1-flash-lite-preview", 1_000_000, 1_000_000);
  expect(cost).toBeCloseTo(0.25 + 1.5, 10);
});
```

## Dependencies & Risks

- **Low risk**: This is a mechanical addition following a well-established pattern with documented precedent (see `docs/solutions/integration-issues/adding-new-openai-models.md`)
- **Preview model**: `gemini-3.1-flash-lite-preview` is pre-GA. Pricing or model ID could change before GA release
- **No breaking changes**: Purely additive — new constant and pricing entry

## Sources

- [Gemini 3.1 Flash Lite Preview — Official Docs](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-preview)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Prior art: `docs/plans/2026-03-18-001-feat-gpt-5-4-mini-nano-models-plan.md`
- Institutional learning: `docs/solutions/integration-issues/adding-new-openai-models.md` (7-step checklist)
