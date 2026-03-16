---
title: "API Integration Bugs Undetectable by Mocked Tests"
date: 2026-02-17
severity: medium
component: src/core/client.ts, src/core/pricing.ts, src/core/response.ts
tags:
  - response-parsing
  - model-configuration
  - anthropic-integration
  - ai-non-determinism
  - smoke-testing
problem_type: integration-issues
---

# API Integration Bugs Undetectable by Mocked Tests

While building functional smoke tests that call real Anthropic, OpenAI, and Google APIs, two bugs were discovered that 144 mocked unit tests had never caught. A third lesson emerged about AI non-determinism in visual assertion testing.

## Context

The `visual-ai-assertions` library had 144 unit and integration tests — all using `vi.mock()` to intercept provider SDK imports. Every test returned pre-crafted JSON strings as mock responses. This meant:

- No test ever validated that real API responses could be parsed
- No test ever verified that the pricing table matched the models actually sent to APIs
- No test ever observed that different providers return JSON in different formats

## Bug 1: Default Model Mismatch

### Symptom

`estimatedCost` returned `undefined` for OpenAI and Google when users didn't explicitly set a model — the most common usage path.

### Root Cause

Three locations had to stay synchronized but diverged:

| Location                                   | OpenAI value    | Google value              |
| ------------------------------------------ | --------------- | ------------------------- |
| `DEFAULT_MODELS` in `src/core/client.ts`   | `gpt-4o`        | `gemini-2.0-flash`        |
| `PRICING_TABLE` in `src/core/pricing.ts`   | `openai:gpt-4o` | `google:gemini-2.0-flash` |
| Driver constructor in `src/providers/*.ts` | `gpt-4.1-mini`  | `gemini-2.5-flash`        |

The drivers were updated to newer models, but `DEFAULT_MODELS` and `PRICING_TABLE` weren't updated to match. The client used `DEFAULT_MODELS` for cost calculation but the driver used its own default for the actual API call — calculating cost for the wrong model.

### Solution

Align all three locations:

```typescript
// src/core/client.ts
const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-5-20250929",
  openai: "gpt-4.1-mini", // Was: "gpt-4o"
  google: "gemini-2.5-flash", // Was: "gemini-2.0-flash"
};

// src/core/pricing.ts
const PRICING_TABLE: Record<string, ModelPricing> = {
  "anthropic:claude-sonnet-4-5-20250929": {
    inputPricePerToken: 3 / 1_000_000,
    outputPricePerToken: 15 / 1_000_000,
  },
  "openai:gpt-4.1-mini": {
    // Was: "openai:gpt-4o"
    inputPricePerToken: 0.4 / 1_000_000,
    outputPricePerToken: 1.6 / 1_000_000,
  },
  "google:gemini-2.5-flash": {
    // Was: "google:gemini-2.0-flash"
    inputPricePerToken: 0.15 / 1_000_000,
    outputPricePerToken: 0.6 / 1_000_000,
  },
};
```

Unit test cost assertions were updated to match the new pricing (e.g., OpenAI `200 input + 100 output` changed from `0.0015` to `0.00024`).

### Why Mocked Tests Missed It

Mocked tests returned pre-crafted usage numbers and never called `calculateCost()` with the actual model string the driver would use. The mock response had hardcoded token counts, and the cost assertion matched the hardcoded pricing — a circular validation that never touched the real default model path.

## Bug 2: Anthropic JSON Code Fence Wrapping

### Symptom

8 of 10 Anthropic smoke tests failed with `VisualAIResponseParseError: Failed to parse AI response as JSON: ```json`.

### Root Cause

Each provider returns JSON differently:

| Provider  | JSON Mode                                  | Response Format                              |
| --------- | ------------------------------------------ | -------------------------------------------- |
| Anthropic | None (no native JSON mode)                 | Wraps in ` ```json ... ``` ` markdown fences |
| OpenAI    | `response_format: { type: "json_object" }` | Raw JSON                                     |
| Google    | `responseMimeType: "application/json"`     | Raw JSON                                     |

The response parser did `JSON.parse(raw)` directly. This works for OpenAI and Google (raw JSON), but fails for Anthropic because `JSON.parse` chokes on the leading backticks.

### Solution

Added `stripCodeFences()` in `src/core/response.ts`:

````typescript
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/s.exec(trimmed);
  return match?.[1] ?? trimmed;
}
````

Applied to both parsers:

```typescript
parsed = JSON.parse(stripCodeFences(raw)); // Was: JSON.parse(raw)
```

The function is a safe no-op for OpenAI and Google — valid JSON never starts with backticks, so the regex simply doesn't match and returns the original text.

### Why Mocked Tests Missed It

Every mocked Anthropic response was a raw JSON string like `'{"pass":true,...}'`. Real Claude responses wrap this as ` ```json\n{"pass":true,...}\n``` `. Mocks bypassed the actual SDK and API, so the wrapping behavior was never observed.

## Lesson 3: AI Non-determinism in Assertions

### Symptom

Two smoke tests failed with `expected false to be true`:

- Anthropic `pageLoad()`: Claude saw a "missing/broken" product image and returned `pass: false`
- OpenAI `compare()` with identical images: GPT-4.1-mini returned `pass: false`

### Root Cause

AI models interpret visual content subjectively. Claude's interpretation of a slightly degraded product image as "broken" is legitimate. GPT being overly cautious about image identity is its own judgment call. These are not bugs — they're the nature of AI-powered assertions.

### Solution

Use tiered assertion strategies based on confidence:

| Tier                      | When to Use                      | Example                                                        |
| ------------------------- | -------------------------------- | -------------------------------------------------------------- |
| **Assert pass/fail**      | Extremely obvious visual content | "A search bar is visible" / "A login form is visible"          |
| **Assert structure only** | Ambiguous or subjective content  | `accessibility()`, `layout()`, `pageLoad()`                    |
| **Always assert**         | Infrastructure validation        | Schema shape, `usage.inputTokens > 0`, `estimatedCost < $0.05` |

```typescript
// High confidence — assert semantic result
expect(result.pass).toBe(true); // Search bar is unambiguously visible

// Ambiguous — assert structure only
assertCheckStructure(result); // Schema valid, reasoning non-empty
assertUsageTracked(result); // Usage and cost tracking work
// Don't assert result.pass — AI judgment varies
```

## Prevention Strategies

### For Model Mismatch

1. **Single source of truth**: Consider extracting `MODEL_DEFAULTS` and `PRICING_TABLE` into a shared `src/core/models.ts` module that both `client.ts` and `pricing.ts` import from, and that drivers reference for their defaults.

2. **Consistency test**: Add a test that verifies every entry in `DEFAULT_MODELS` has a corresponding entry in `PRICING_TABLE`:

```typescript
it("every default model has a pricing entry", () => {
  for (const [provider, model] of Object.entries(DEFAULT_MODELS)) {
    const cost = calculateCost(provider, model, 100, 100);
    expect(cost).toBeTypeOf("number"); // Not undefined
  }
});
```

3. **CLAUDE.md rule**: Document that `DEFAULT_MODELS`, `PRICING_TABLE`, and driver constructor defaults must stay synchronized.

### For Response Format Differences

1. **Smoke tests are the guard**: Mocked tests fundamentally cannot catch provider response format changes. Regular smoke test runs (before releases) are the only defense.

2. **Unit tests for stripCodeFences**: Add parameterized tests covering fenced JSON, raw JSON, and edge cases to prevent regressions in the stripping logic itself.

3. **Document the contract**: Add a comment on `RawProviderResponse` explaining that `.text` may contain markdown-wrapped JSON (Anthropic) or raw JSON (OpenAI/Google), and that `stripCodeFences()` normalizes both.

### For AI Non-determinism

1. **Separate test categories**: Unit tests (mocked, deterministic, CI) vs. smoke tests (real APIs, non-deterministic, manual).

2. **Assert infrastructure, not AI opinion**: Every smoke test should validate schema, usage tracking, and cost estimation. Only assert pass/fail for truly unambiguous visual content.

3. **Choose obvious assertions**: "A search bar is visible" is unambiguous. "The page looks well-designed" is not. Pick assertions where a human would agree 100% of the time.

## Key Takeaway

Mocked tests validate internal logic. Smoke tests validate integration reality. Both are necessary — but bugs at the integration boundary (response formats, model name alignment, API behavior differences) can only be caught by calling real APIs. The cost of running smoke tests (~$0.05-$0.10 per run) is trivial compared to the cost of shipping parsing bugs to users.

## Related Documentation

- [Per-Call API Cost Monitoring](../best-practices/per-call-api-cost-monitoring.md) — documents the pricing table architecture and three-location sync requirement
- [TypeScript Library Build Configuration](../build-errors/typescript-library-build-configuration.md) — covers dynamic SDK imports and test infrastructure patterns
- [Smoke Tests Plan](../../plans/2026-02-16-feat-functional-smoke-tests-plan.md) — full test matrix and infrastructure setup
