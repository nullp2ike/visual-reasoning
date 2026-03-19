---
title: OpenAI High Reasoning Models Producing Incomplete JSON Due to Token Budget Exhaustion
category: integration-issues
date: 2026-03-19
tags:
  - openai
  - reasoning-tokens
  - json-truncation
  - token-budget
  - structured-output
  - truncation-detection
  - defense-in-depth
severity: high
modules:
  - src/providers/openai.ts
  - src/providers/anthropic.ts
  - src/providers/google.ts
  - src/core/config.ts
  - src/core/client.ts
  - src/core/debug.ts
  - src/errors.ts
  - src/types.ts
  - src/constants.ts
symptoms:
  - Incomplete JSON responses from OpenAI with high/xhigh reasoning effort
  - JSON parsing failures (VisualAIResponseParseError) with truncated output
  - Response truncation under high reasoning load
  - Missing reasoning token usage metrics
root_cause: OpenAI reasoning tokens consume shared max_output_tokens budget; high reasoning effort exhausts token allowance leaving insufficient capacity for complete JSON response
---

# OpenAI Reasoning Token Budget Sharing Causes Truncated JSON Output

## Problem

When using OpenAI models with `reasoningEffort: "high"` or `"xhigh"`, the library produced `RESPONSE_PARSE_FAILED` errors. The AI response JSON was being cut off mid-object, making it unparseable.

**Observed symptoms:**

- `VisualAIResponseParseError` with partial JSON like `{"pass": tr`
- Only occurred with OpenAI provider at high/xhigh reasoning levels
- Anthropic and Google did not exhibit the same behavior

## Root Cause

OpenAI's Responses API uses a single `max_output_tokens` budget shared between reasoning tokens and response tokens. At the default `maxTokens: 4096`, a model using 3000+ reasoning tokens had fewer than 1096 tokens left for the JSON response. The model was forced to stop mid-output, producing invalid JSON.

**Critical provider difference:**

- **OpenAI**: Reasoning tokens share `max_output_tokens` budget (dangerous for structured output)
- **Anthropic**: Thinking tokens have a separate budget from `max_tokens` (safer)
- **Google**: Thinking tokens have a separate budget from `maxOutputTokens` (safer)

The library had no truncation detection, so the incomplete response silently reached the Zod parse layer, which produced a confusing `RESPONSE_PARSE_FAILED` error with no guidance about the actual cause.

## Solution

Defense-in-depth across four layers: prevention, structural guarantee, detection, and validation.

### Layer 1: Auto-increase token budget (`src/core/config.ts`)

When the user hasn't explicitly set `maxTokens` and is using OpenAI with high/xhigh reasoning, the config resolver raises the budget from 4096 to 16384:

```ts
const userSetMaxTokens = config.maxTokens !== undefined;
let maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;

if (
  !userSetMaxTokens &&
  provider === "openai" &&
  (config.reasoningEffort === "high" || config.reasoningEffort === "xhigh")
) {
  maxTokens = OPENAI_REASONING_MAX_TOKENS; // 16384
}
```

A debug-mode log explains when auto-increase triggers.

### Layer 2: Structured output via `json_schema` (`src/core/client.ts`, `src/providers/openai.ts`)

Zod response schemas are pre-converted to JSON Schema at module load time and passed to OpenAI's `json_schema` structured output mode, which guarantees syntactically valid JSON:

```ts
function toSchemaOptions(schema: z.ZodType): SendMessageOptions {
  return {
    responseSchema: zodToJsonSchema(schema, { target: "openAi" }) as Record<string, unknown>,
  };
}

const checkSchemaOptions = toSchemaOptions(CheckResponseSchema);
```

In the OpenAI driver, this switches from `json_object` to `json_schema` format:

```ts
const format = options?.responseSchema
  ? {
      type: "json_schema" as const,
      json_schema: {
        name: "visual_ai_response",
        strict: true,
        schema: options.responseSchema,
      },
    }
  : { type: "json_object" as const };
```

### Layer 3: Truncation detection across all providers

A new `VisualAITruncationError` with code `"RESPONSE_TRUNCATED"` carries `partialResponse` and `maxTokens` for actionable error messages.

**OpenAI** — checks `response.status`:

```ts
if (response.status && response.status !== "completed") {
  throw new VisualAITruncationError(
    `Response truncated: OpenAI returned status "${response.status}"...`,
    response.output_text ?? "",
    this.maxTokens,
  );
}
```

**Anthropic** — checks `stop_reason`:

```ts
if (message.stop_reason === "max_tokens") {
  throw new VisualAITruncationError(
    `Response truncated: Anthropic stopped due to max_tokens limit...`,
    text,
    this.maxTokens,
  );
}
```

**Google** — checks `finishReason` with differentiated handling:

```ts
if (finishReason === "MAX_TOKENS") {
  throw new VisualAITruncationError(...);
}
if (finishReason && finishReason !== "STOP") {
  throw new VisualAIProviderError(
    `Response blocked: Google returned finishReason "${finishReason}".`,
  );
}
```

Only `MAX_TOKENS` is a truncation error. `SAFETY`, `RECITATION`, and other reasons throw `VisualAIProviderError` since they represent content blocking, not token exhaustion.

### Layer 4: Zod validation (existing)

The existing Zod parse layer catches any remaining malformed responses that slip through layers 1-3.

### Reasoning token extraction

OpenAI and Google now surface reasoning/thinking tokens in usage output:

- **OpenAI**: `usage.output_tokens_details.reasoning_tokens` → `usage.reasoningTokens`
- **Google**: `usageMetadata.thoughtsTokenCount` → `usage.reasoningTokens`
- **Anthropic**: Does not expose a separate thinking token count (rolled into `output_tokens`)

## Investigation Steps

1. **Reproduced the failure**: `debugResponse: true` revealed JSON cut off mid-object at high reasoning effort.
2. **Identified budget sharing**: OpenAI's `max_output_tokens` is a single budget for reasoning + response tokens. At 4096, high reasoning consumed most of it.
3. **Rejected retry logic**: Auto-retry with higher tokens hides misconfiguration and wastes money silently. Prevention + clear errors is better.
4. **Chose structured output over prompt engineering**: `json_schema` gives a structural guarantee; "be brief" prompting is unreliable.
5. **Normalized error semantics**: All providers now throw `VisualAITruncationError` on budget exhaustion vs `VisualAIProviderError` on content blocks.

## Prevention Strategies

### For users of this library

- If you see `RESPONSE_TRUNCATED`, increase `maxTokens` in your config or lower `reasoningEffort`.
- The library auto-increases for OpenAI + high/xhigh, but explicit `maxTokens` overrides the auto-increase.
- Use `trackUsage: true` to monitor reasoning token consumption.

### For developers extending this library

- **When adding a new provider**: Check how reasoning/thinking tokens interact with the output token budget. If shared (like OpenAI), add auto-increase logic in `resolveConfig`.
- **When adding a new response type**: Add its Zod schema to `toSchemaOptions()` in `client.ts` to get `json_schema` structured output for OpenAI.
- **Error semantics**: Only throw `VisualAITruncationError` for actual token budget exhaustion. Content filtering, safety blocks, etc. should throw `VisualAIProviderError`.

### Key learnings

- Different AI providers handle reasoning tokens fundamentally differently. Never assume parity.
- Defense-in-depth is essential: no single layer catches all cases.
- Error classification matters: truncation (retry with more tokens) vs content blocking (don't retry) require different user actions.

## When This Applies

**High-risk scenarios:**

- OpenAI + high/xhigh reasoning effort + structured JSON output
- Any provider with very low `maxTokens` and reasoning enabled
- Complex multi-statement checks that produce large JSON responses

**Lower-risk scenarios:**

- Anthropic/Google with separate thinking budgets
- No reasoning effort configured
- Simple single-statement checks

## Related Documentation

- [Origin plan](../../plans/2026-03-19-005-fix-openai-reasoning-truncation-plan.md)
- [Requirements](../../brainstorms/2026-03-19-openai-truncation-fix-requirements.md)
- [API integration bugs undetectable by mocked tests](./api-integration-bugs-undetectable-by-mocked-tests.md) — why smoke tests matter for truncation detection
- [Gemini thinking budget to thinking level migration](./gemini-thinking-budget-to-thinking-level-migration.md) — related provider reasoning config changes
- [Composable prompt blocks and API consistency](../best-practices/composable-prompt-blocks-and-api-consistency.md) — structured output patterns
