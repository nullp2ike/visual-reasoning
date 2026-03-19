---
title: Adding new AI models to visual-ai-assertions
category: integration-issues
date: 2026-03-19
tags: [models, provider-integration, typescript, pricing, constants, readme]
components: [constants, pricing, tests, README]
severity: low
resolution_time: quick
---

# Adding New AI Models

## Problem

When a provider releases a new model, the library needs manual registration across multiple files: constants, pricing, tests, and README. The process is identical for all providers (Anthropic, OpenAI, Google).

## Root Cause

Not a bug — this is a recurring integration task. The library's architecture auto-derives most artifacts (types, provider routing, reverse maps), but constants, pricing, and documentation require manual updates.

## Solution

### Checklist for Adding New Models

1. **Add model constant to `src/constants.ts`** — add entry to `Model.<Provider>` object
2. **Update `DEFAULT_MODELS`** only if the new model should replace the current default (rare — only for GA models that offer strict improvement for visual reasoning)
3. **Add pricing entry to `src/core/pricing.ts`** — use `$/M / PER_MILLION` pattern
4. **Verify prefix coverage in `src/core/config.ts`** — usually no change needed; existing prefixes (`gpt-`, `claude-`, `gemini-`) already handled
5. **Update `tests/constants.test.ts`** — add model value assertion
6. **Update `tests/core/pricing.test.ts`** — add cost calculation test using `1000` input / `500` output tokens and `toBeCloseTo(expected, 10)`
7. **Update `README.md`** — add model to the provider's supported models table
8. **Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`**

### What's Auto-Derived (No Changes Needed)

| Artifact                | How                                                                          |
| ----------------------- | ---------------------------------------------------------------------------- |
| `KnownModelName` type   | Union extracted from all `Model` object values via `typeof`                  |
| `MODEL_TO_PROVIDER` map | Built by iterating `Object.values(Model.<Provider>)` at runtime              |
| Provider routing        | `MODEL_PREFIX_TO_PROVIDER` uses prefix matching (e.g., `"gemini-"` → Google) |

### Code Pattern

**`src/constants.ts`:**

```typescript
Google: {
  GEMINI_3_1_PRO_PREVIEW: "gemini-3.1-pro-preview",
  GEMINI_3_1_FLASH_LITE_PREVIEW: "gemini-3.1-flash-lite-preview",  // NEW
  GEMINI_3_FLASH_PREVIEW: "gemini-3-flash-preview",
},
```

**`src/core/pricing.ts`:**

```typescript
[`${Provider.GOOGLE}:${Model.Google.GEMINI_3_1_FLASH_LITE_PREVIEW}`]: {
  inputPricePerToken: 0.25 / PER_MILLION,
  outputPricePerToken: 1.5 / PER_MILLION,
},
```

**`tests/core/pricing.test.ts`:**

```typescript
it("calculates cost for google gemini-3.1-flash-lite-preview", () => {
  const cost = calculateCost("google", "gemini-3.1-flash-lite-preview", 1000, 500);
  // 1000 * (0.25/1M) + 500 * (1.5/1M) = 0.00025 + 0.00075 = 0.001
  expect(cost).toBeCloseTo(0.001, 10);
});
```

### Provider-Specific Notes

**Google (Gemini):**

- `needsCodeExecution()` regex `/^gemini-(\d+)/` captures major version — verify new models parse correctly
- AI diff image generation is hardcoded to `gemini-3-flash-preview` only; lite/preview models should NOT be added to the diff allowlist
- Thinking/reasoning budget (`GOOGLE_THINKING_BUDGET`) applies to all Google models — verify the new model supports `thinkingConfig` before relying on reasoning effort

**OpenAI:**

- When changing the default, prefer the model tier natural successor (e.g., `gpt-5-mini` → `gpt-5.4-mini`)
- Nano-tier models are optimized for classification/extraction, not complex visual analysis

**Anthropic:**

- No provider-specific considerations beyond the standard checklist

## Common Pitfalls

1. **Forgetting pricing entries** — model works but cost tracking silently returns `undefined`
2. **Forgetting README updates** — models become available in code but invisible in docs (this happened with GPT-5.4 mini/nano, discovered only when adding a later model)
3. **Inconsistent test token counts** — always use `1000` input / `500` output to match the pricing test file convention; using different values (e.g., 1M/1M) works but breaks readability patterns
4. **Forgetting tests** — project targets 80%+ coverage; untested entries drop it
5. **New prefix not covered** — only relevant for entirely new providers (e.g., `"mistral-"`); existing prefixes already handled
6. **Changing default without updating tests** — `tests/constants.test.ts` asserts the default value
7. **Not running full check suite** — typecheck catches constant naming inconsistencies

## Prevention Strategies

- Always link to the provider's official pricing page in the PR for reviewer verification
- Consider adding a cross-reference test that verifies every model in `Model.*` has a corresponding `PRICING_TABLE` entry (turns silent `undefined` cost into a CI failure)
- Consider adding a test that verifies every known model appears in `README.md` (catches documentation drift automatically)
- Only change the default when the new model is GA and offers a strict improvement for the library's primary use case (visual reasoning)
- Treat default model changes as potentially breaking — call out in changelog

## Real-World Examples

### GPT-5.4 mini/nano addition (2026-03-18)

- Added two models, changed OpenAI default from `gpt-5-mini` to `gpt-5.4-mini`
- Missed README update (discovered later during Gemini 3.1 Flash Lite addition)

### Gemini 3.1 Flash Lite Preview addition (2026-03-19)

- Added one model, no default change (lite model is opt-in budget alternative)
- Code review caught inconsistent pricing test token counts (1M vs 1000/500)
- Fixed pre-existing README gap (missing GPT-5.4 mini/nano) at the same time

## Related Documentation

- [per-call-api-cost-monitoring.md](../best-practices/per-call-api-cost-monitoring.md) — documents PRICING_TABLE architecture and three-location sync rule
- [consolidate-magic-strings-with-as-const-satisfies.md](../best-practices/consolidate-magic-strings-with-as-const-satisfies.md) — documents constants pattern and KnownModelName derivation
- [api-integration-bugs-undetectable-by-mocked-tests.md](./api-integration-bugs-undetectable-by-mocked-tests.md) — documents the model mismatch bug class this change could introduce

## Sources

- [Gemini 3.1 Flash Lite Preview docs](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-preview)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
