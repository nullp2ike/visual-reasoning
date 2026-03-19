---
date: 2026-03-19
topic: openai-truncation-fix
---

# Fix Truncated JSON from OpenAI Reasoning Models

## Problem Frame

When users configure higher reasoning effort levels (`high` / `xhigh`) with OpenAI models, the model spends most of the `max_output_tokens` budget (default 4096) on internal reasoning, leaving insufficient tokens for the JSON output. The result is truncated, unparseable JSON that surfaces as a generic `VisualAIResponseParseError` with no indication of the root cause.

Additionally, none of the three providers check for truncated responses, and reasoning/thinking tokens are invisible in usage output — making it impossible for users to diagnose the issue.

## Requirements

- R1. **OpenAI truncation detection**: Check the OpenAI Responses API `status` field after each call. If the response is incomplete (status is not `"completed"`), throw a specific, actionable error that tells the user the output was truncated and suggests increasing `maxTokens`.
- R2. **Anthropic truncation detection**: Check the Anthropic Messages API `stop_reason` field. If it is `"max_tokens"` instead of `"end_turn"`, throw the same actionable truncation error.
- R3. **Google truncation detection**: Check the Gemini API `finishReason` on the candidate. If it indicates token exhaustion (e.g., `"MAX_TOKENS"`), throw the same actionable truncation error.
- R4. **OpenAI structured output**: Switch OpenAI from `json_object` format to `json_schema` response format, providing the expected Zod schema as a JSON Schema. This gives OpenAI's API a structural guarantee that the JSON will be complete and valid, even under token pressure.
- R5. **OpenAI auto-increase token budget**: When reasoning effort is `high` or `xhigh` and the user has not explicitly set `maxTokens`, automatically increase `max_output_tokens` to a higher default (e.g., 16384) to give the model room for both reasoning and output.
- R6. **Expose reasoning tokens in usage**: Add an optional `reasoningTokens` field to `UsageInfo` and populate it from each provider's API response (`output_tokens_details.reasoning_tokens` for OpenAI, thinking block tokens for Anthropic, `thoughtsTokenCount` for Google).

## Success Criteria

- OpenAI models with `reasoningEffort: "high"` or `"xhigh"` reliably return complete, parseable JSON without users needing to manually increase `maxTokens`.
- When any provider truncates output, the error message clearly identifies truncation as the cause and suggests a fix.
- Users can inspect `result.usage.reasoningTokens` to see how much of their token budget went to thinking.

## Scope Boundaries

- Do not auto-increase tokens for Anthropic or Google — their thinking tokens are separate from the output budget.
- Do not add structured output (`json_schema`) for Anthropic or Google — their truncation risk is low and their structured output mechanisms differ significantly.
- Do not add retry logic — surface the error clearly and let the user decide.

## Key Decisions

- **All three providers get truncation detection**: Even though Anthropic/Google have low truncation risk, silent failures are unacceptable per project rules ("errors over silent failures"). The cost of adding the check is trivial.
- **Structured output only for OpenAI**: OpenAI's `json_schema` format is the most reliable way to prevent malformed JSON. Anthropic and Google don't have an equivalent need since their thinking tokens don't compete with output tokens.
- **Auto-increase only for OpenAI, only when user hasn't set maxTokens**: Respects explicit user configuration. Only applies the safety net when the default would be insufficient.
- **Reasoning tokens exposed across all providers**: Gives users universal visibility into thinking costs, regardless of provider.

## Outstanding Questions

### Deferred to Planning

- [Affects R4][Needs research] What is the exact JSON Schema format OpenAI's Responses API expects for `json_schema` response format? Need to verify how Zod schemas convert to JSON Schema and whether `zod-to-json-schema` or manual conversion is better.
- [Affects R5][Technical] What should the auto-increased token default be? 16384 is a starting point but should be validated against typical reasoning token consumption at `high` and `xhigh` levels.
- [Affects R6][Needs research] Exact field paths for reasoning tokens in each provider's response object — need to verify against current SDK versions.
- [Affects R1-R3][Technical] Should the truncation error be a new `VisualAITruncationError` subclass or reuse `VisualAIResponseParseError` with an enriched message?

## Next Steps

-> `/ce:plan` for structured implementation planning
