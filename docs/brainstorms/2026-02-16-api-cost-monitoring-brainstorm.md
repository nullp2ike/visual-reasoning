# API Token & Cost Monitoring

**Date:** 2026-02-16
**Status:** Brainstorm

## What We're Building

Per-call API token and cost monitoring for visual-ai-assertions. Each API call will:

1. Log token usage and estimated cost to stderr (controlled by a `trackUsage` config flag, **on by default**)
2. Include `estimatedCost` in the result object's `usage` field alongside existing `inputTokens`/`outputTokens`

This gives users visibility into what each visual assertion costs without any extra setup.

## Why This Approach

**Client-layer cost calculation (Approach A)** was chosen over provider-driver or middleware alternatives because:

- Pricing is a pure function of (provider, model, token counts) - no reason to distribute it across drivers
- The client already knows the provider and model from `ClientConfig`
- Keeps provider drivers thin and focused on API communication
- A single `src/core/pricing.ts` file is easy to maintain and update

## Key Decisions

1. **Per-call visibility only** - No cumulative tracking across calls. Each call reports its own cost. Users who want aggregation can sum it themselves.

2. **Hardcoded pricing defaults** - Ship known prices for popular models (Claude Sonnet, GPT-4o, Gemini Pro/Flash). Update in library releases. No user-configurable pricing overrides.

3. **Dual output** - Cost appears both in stderr logging (via `trackUsage` flag) AND in the result object (`usage.estimatedCost`). Users can use either or both.

4. **Separate config flag** - New `trackUsage: boolean` (default `true`) in `ClientConfig`. Independent from `debug` flag. Controls stderr logging only; `estimatedCost` is always present in results when usage data is available.

5. **Pricing lives in `src/core/pricing.ts`** - A lookup table mapping (provider, model) to per-token input/output prices. Returns `estimatedCost` in USD as a number.

## Scope

### In Scope

- Pricing lookup table for default models (Anthropic: claude-sonnet-4-5-20250929; OpenAI: gpt-4o; Google: gemini-2.0-flash)
- `estimatedCost` field added to usage on `CheckResult` and `QueryResult`
- stderr logging of tokens + cost per call when `trackUsage` is enabled
- `trackUsage` config option (default: true)

### Out of Scope

- Cumulative/session-level tracking
- User-configurable pricing overrides
- Cost budgets or alerts
- Caching token prices from provider APIs

## Open Questions

_None - all key decisions resolved._
