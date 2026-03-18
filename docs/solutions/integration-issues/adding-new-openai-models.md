---
title: Adding new OpenAI models (GPT-5.4 mini/nano) to visual-ai-assertions
category: integration-issues
date: 2026-03-18
tags: [openai, models, provider-integration, typescript, defaults]
components: [constants, pricing, tests]
severity: low
resolution_time: quick
---

# Adding New OpenAI Models (GPT-5.4 mini/nano)

## Problem

OpenAI released GPT-5.4 mini and GPT-5.4 nano on 2026-03-17. The library needed to support these models and update the default OpenAI model from `gpt-5-mini` to `gpt-5.4-mini`.

## Root Cause

Not a bug — this is a recurring integration task. New provider models require manual addition to constants, pricing, and tests.

## Solution

### Checklist for Adding New Models

1. **Add model constant(s) to `src/constants.ts`** — add entries to the `Model.<Provider>` object
2. **Update default model** in `DEFAULT_MODELS` (if the new model should be the default)
3. **Add pricing entries to `src/core/pricing.ts`** — use `$/M / PER_MILLION` pattern
4. **Verify prefix coverage in `src/core/config.ts`** — usually no change needed for existing providers
5. **Update `tests/constants.test.ts`** — add model value assertions, update default assertion if changed
6. **Update `tests/core/pricing.test.ts`** — add cost calculation tests
7. **Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`**

### What's Auto-Derived (No Changes Needed)

| Artifact                | How                                                                       |
| ----------------------- | ------------------------------------------------------------------------- |
| `KnownModelName` type   | Union extracted from all `Model` object values                            |
| `MODEL_TO_PROVIDER` map | Built by iterating `Model` at runtime                                     |
| Provider routing        | `MODEL_PREFIX_TO_PROVIDER` uses prefix matching (e.g., `"gpt-"` → OpenAI) |

### Code Pattern

**`src/constants.ts`:**

```typescript
OpenAI: {
  GPT_5_4: "gpt-5.4",
  GPT_5_4_PRO: "gpt-5.4-pro",
  GPT_5_4_MINI: "gpt-5.4-mini",    // NEW
  GPT_5_4_NANO: "gpt-5.4-nano",    // NEW
  GPT_5_2: "gpt-5.2",
  GPT_5_MINI: "gpt-5-mini",
},

// Update default:
[Provider.OPENAI]: Model.OpenAI.GPT_5_4_MINI,
```

**`src/core/pricing.ts`:**

```typescript
[`${Provider.OPENAI}:${Model.OpenAI.GPT_5_4_MINI}`]: {
  inputPricePerToken: 0.75 / PER_MILLION,
  outputPricePerToken: 4.5 / PER_MILLION,
},
[`${Provider.OPENAI}:${Model.OpenAI.GPT_5_4_NANO}`]: {
  inputPricePerToken: 0.2 / PER_MILLION,
  outputPricePerToken: 1.25 / PER_MILLION,
},
```

## Common Pitfalls

1. **Forgetting pricing entries** — model works but cost tracking returns `undefined`
2. **Forgetting tests** — project targets 80%+ coverage; new untested entries drop it
3. **New prefix not covered** — only relevant for new providers (e.g., `"mistral-"`); existing prefixes (`gpt-`, `claude-`, `gemini-`) already handled
4. **Changing default without updating tests** — `tests/constants.test.ts` asserts the default value
5. **Not running full check suite** — typecheck catches model constant naming inconsistencies

## Prevention Strategies

- Always link to the provider's official pricing page in the PR for reviewer verification
- Consider adding a cross-reference test that verifies every model in `Model.*` has a corresponding pricing entry
- Only change the default when the new model is GA and offers a strict improvement for the library's primary use case (visual reasoning)
- Treat default model changes as potentially breaking — call out in changelog

## Deciding Whether to Change the Default

For this change, `gpt-5.4-mini` was chosen over `gpt-5.4-nano` because:

- Better capability balance for visual reasoning tasks (the library's core use case)
- Natural successor to `gpt-5-mini` (same model tier, next generation)
- `gpt-5.4-nano` is optimized for classification/extraction, not complex visual analysis

## Related Documentation

- [per-call-api-cost-monitoring.md](../best-practices/per-call-api-cost-monitoring.md) — documents PRICING_TABLE architecture and three-location sync rule
- [consolidate-magic-strings-with-as-const-satisfies.md](../best-practices/consolidate-magic-strings-with-as-const-satisfies.md) — documents constants pattern and KnownModelName derivation
- [api-integration-bugs-undetectable-by-mocked-tests.md](./api-integration-bugs-undetectable-by-mocked-tests.md) — documents the class of bug (model mismatch) this change could introduce

## Sources

- [OpenAI GPT-5.4 mini announcement](https://openai.com/index/introducing-gpt-5-4-mini-and-nano/)
- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- [GPT-5.4 mini model docs](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
