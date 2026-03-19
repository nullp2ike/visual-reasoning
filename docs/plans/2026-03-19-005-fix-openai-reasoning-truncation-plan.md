---
title: "fix: Prevent truncated JSON from OpenAI reasoning models"
type: fix
status: active
date: 2026-03-19
origin: docs/brainstorms/2026-03-19-openai-truncation-fix-requirements.md
---

# fix: Prevent truncated JSON from OpenAI reasoning models

## Overview

When OpenAI reasoning models use higher effort levels (`high`/`xhigh`), internal reasoning tokens consume the `max_output_tokens` budget (default 4096), leaving insufficient room for JSON output. The result is truncated, unparseable JSON that surfaces as a generic `VisualAIResponseParseError` with no indication of the root cause.

This plan implements a defense-in-depth strategy: **R5** prevents most truncation via a larger budget, **R4** guarantees structurally valid JSON via OpenAI's `json_schema`, **R1/R2/R3** detect truncation that slips through, and the existing Zod parse layer catches anything else.

## Problem Statement / Motivation

Users configuring `reasoningEffort: "high"` or `"xhigh"` with OpenAI models get opaque parse errors. The library provides no truncation detection for any provider, and reasoning token consumption is invisible in usage output. (See origin: `docs/brainstorms/2026-03-19-openai-truncation-fix-requirements.md`)

## Proposed Solution

Six changes, ordered by dependency:

1. **R6** — Add `reasoningTokens` to `UsageInfo` and extract from all providers
2. **R1/R2/R3** — Add truncation detection to all three providers
3. **R5** — Auto-increase OpenAI token budget for high reasoning effort
4. **R4** — Switch OpenAI to `json_schema` structured output

## Technical Approach

### Phase 1: Foundation — Types, Error Class, and Usage (R6 + error class)

**New error class** in `src/errors.ts`:

```typescript
// src/errors.ts — add new error code and class
// Add "RESPONSE_TRUNCATED" to VisualAIErrorCode union (line 6)

export class VisualAITruncationError extends VisualAIError<"RESPONSE_TRUNCATED"> {
  constructor(
    message: string,
    public readonly partialResponse: string,
    public readonly maxTokens: number,
  ) {
    super("RESPONSE_TRUNCATED", message);
  }
}
```

The error message should be actionable, e.g.: `"Response truncated: the model exhausted the output token budget (4096 tokens). This commonly happens with higher reasoning effort levels. Increase maxTokens in your config (e.g., maxTokens: 16384) or lower reasoningEffort."`

**Extend `UsageInfo`** in `src/types.ts`:

```typescript
// src/types.ts — add optional reasoningTokens (line ~57)
export const UsageInfoSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  reasoningTokens: z.number().optional(), // NEW
  estimatedCost: z.number().optional(),
  durationSeconds: z.number().nonnegative().optional(),
});
```

**Extend `RawProviderResponse`** in `src/providers/types.ts`:

```typescript
// src/providers/types.ts — add reasoningTokens to usage
usage?: {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number; // NEW
};
```

**Update `processUsage`** in `src/core/debug.ts` to pipe `reasoningTokens` through and include in the log line: `"100 input + 50 output (12 reasoning) tokens"`.

**Files:** `src/errors.ts`, `src/types.ts`, `src/providers/types.ts`, `src/core/debug.ts`, `src/index.ts` (export new error class)

**Tests:** `tests/errors.test.ts` (new error class), `tests/core/debug.test.ts` (reasoning tokens in log)

### Phase 2: Truncation Detection (R1, R2, R3)

Truncation detection happens **in each driver's `sendMessage`**, before returning the response text. This ensures the parse layer never sees partial JSON.

**OpenAI** — `src/providers/openai.ts`:

```typescript
// Extend OpenAIResponseResult interface to include status
interface OpenAIResponseResult {
  output_text?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    output_tokens_details?: { reasoning_tokens?: number };
  };
  status?: string; // "completed" | "incomplete" | "failed"
  incomplete_details?: { reason?: string };
}

// After line 80 (const response = await client.responses.create(...)):
if (response.status && response.status !== "completed") {
  throw new VisualAITruncationError(
    `Response truncated: OpenAI returned status "${response.status}"...`,
    response.output_text ?? "",
    this.maxTokens,
  );
}
```

Also extract `reasoningTokens` from `response.usage?.output_tokens_details?.reasoning_tokens`.

**Anthropic** — `src/providers/anthropic.ts`:

```typescript
// Extend AnthropicMessage interface to include stop_reason
interface AnthropicMessage {
  content: Array<{ type: string; text?: string }>;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason?: string; // "end_turn" | "max_tokens" | "stop_sequence"
}

// After line 88 (const message = await client.messages.create(...)):
if (message.stop_reason === "max_tokens") {
  throw new VisualAITruncationError(
    `Response truncated: Anthropic stopped due to max_tokens limit...`,
    textBlock?.text ?? "",
    this.maxTokens,
  );
}
```

For reasoning tokens: Anthropic includes thinking tokens in the usage when extended thinking is enabled. Check for `usage.thinking_tokens` or similar field in the SDK response. If unavailable, leave as `undefined`.

**Google** — `src/providers/google.ts`:

```typescript
// Extend GoogleGenerateContentResponse candidates with finishReason
candidates?: Array<{
  content?: { parts?: GeminiImagePart[] };
  finishReason?: string; // "STOP" | "MAX_TOKENS" | "SAFETY" | "RECITATION" | etc.
}>;

// After receiving response, check finishReason:
const finishReason = response.candidates?.[0]?.finishReason;
if (finishReason && finishReason !== "STOP") {
  throw new VisualAITruncationError(
    `Response incomplete: Google returned finishReason "${finishReason}"...`,
    response.text ?? "",
    this.maxTokens,
  );
}
```

For reasoning tokens: extract from `response.usageMetadata?.thoughtsTokenCount` or the equivalent field in the current SDK.

**Note on Google `generateImage`:** Truncation detection does NOT apply to `generateImage` — it has its own error handling and is not JSON-based. (See origin: scope boundaries)

**Files:** `src/providers/openai.ts`, `src/providers/anthropic.ts`, `src/providers/google.ts`

**Tests:** `tests/providers/openai.test.ts`, `tests/providers/anthropic.test.ts`, `tests/providers/google.test.ts` — add tests for:

- Truncated response throws `VisualAITruncationError` with correct code, partial text, and maxTokens
- Completed/successful response still works (regression)
- Reasoning tokens are extracted and returned in usage

### Phase 3: Auto-Increase Token Budget (R5)

Handle in `src/core/config.ts` during `resolveConfig`, where we know whether the user explicitly provided `maxTokens`.

```typescript
// src/core/config.ts — in resolveConfig
// Track whether user explicitly set maxTokens
const userSetMaxTokens = config.maxTokens !== undefined;

// After determining provider is OpenAI and reasoning effort is high/xhigh:
if (
  !userSetMaxTokens &&
  resolvedProvider === "openai" &&
  (resolvedReasoningEffort === "high" || resolvedReasoningEffort === "xhigh")
) {
  resolvedMaxTokens = OPENAI_REASONING_MAX_TOKENS; // 16384
}
```

Add new constant in `src/constants.ts`:

```typescript
/** Increased token budget for OpenAI when reasoning effort is high/xhigh.
 *  Reasoning tokens share the output budget on OpenAI, so the default 4096
 *  is insufficient for higher reasoning levels. */
export const OPENAI_REASONING_MAX_TOKENS = 16384;
```

**Why `resolveConfig` and not the driver:** The driver receives a fully-resolved `maxTokens` number and has no way to know if the user set it. `resolveConfig` is the right place because it has access to the raw user input.

**Why not `medium` effort:** At `medium`, reasoning overhead is moderate and 4096 is generally sufficient. Auto-increasing for `medium` would waste tokens/money for the majority of users. (See origin: key decisions)

**Files:** `src/core/config.ts`, `src/constants.ts`

**Tests:** `tests/core/config.test.ts` — test that:

- OpenAI + high effort + no explicit maxTokens → 16384
- OpenAI + xhigh effort + no explicit maxTokens → 16384
- OpenAI + high effort + explicit maxTokens: 8192 → 8192 (user intent preserved)
- OpenAI + medium effort → 4096 (no increase)
- Anthropic + high effort → 4096 (no increase, only OpenAI affected)

### Phase 4: Structured Output (R4)

**Architecture decision:** Add an optional `responseSchema` parameter to `sendMessage`.

```typescript
// src/providers/types.ts — extend ProviderDriver interface
export interface ProviderDriver {
  sendMessage(
    images: NormalizedImage[],
    prompt: string,
    options?: SendMessageOptions, // NEW optional parameter
  ): Promise<RawProviderResponse>;
}

export interface SendMessageOptions {
  /** JSON Schema for structured output. Currently used by OpenAI only. */
  responseSchema?: Record<string, unknown>;
}
```

**Client-side schema conversion** in `src/core/client.ts`:

The client knows which operation is running (check, ask, compare). It converts the relevant Zod schema to JSON Schema and passes it to `sendMessage`:

```typescript
// In each operation method (check, ask, compare, etc.):
import { zodToJsonSchema } from "zod-to-json-schema";

const jsonSchema = zodToJsonSchema(CheckResponseSchema, { target: "openAi" });
const raw = await timedSendMessage(driver, images, prompt, { responseSchema: jsonSchema });
```

**OpenAI driver** uses the schema:

```typescript
// src/providers/openai.ts — in sendMessage
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

requestParams.text = { format };
```

If no schema is passed (e.g., from a custom caller), falls back to `json_object` — backward compatible.

**Anthropic and Google drivers** ignore `options?.responseSchema` — they have no equivalent need (see origin: scope boundaries).

**New dependency:** `zod-to-json-schema` — lightweight, well-maintained, handles the Zod-to-JSON-Schema conversion without manual schema duplication. The response schemas are simple (no recursive types) so the conversion is straightforward.

**Files:** `src/providers/types.ts`, `src/providers/openai.ts`, `src/providers/anthropic.ts` (signature update only), `src/providers/google.ts` (signature update only), `src/core/client.ts`, `package.json` (new dep)

**Tests:** `tests/providers/openai.test.ts` — test that:

- When `responseSchema` is provided, request uses `json_schema` format with the schema
- When `responseSchema` is omitted, request uses `json_object` format (backward compat)
- Schema name is `"visual_ai_response"` and strict mode is enabled

## System-Wide Impact

- **Interaction graph:** `resolveConfig` → driver constructor → `sendMessage` → response parsing → result. Changes touch config resolution (R5), driver interface (R4), driver internals (R1-R3, R6), and the public `UsageInfo` type (R6).
- **Error propagation:** New `VisualAITruncationError` thrown in drivers, caught by `mapProviderError` only if it's NOT already a `VisualAI*` error (existing pattern in `error-mapper.ts`). Propagates to user as-is.
- **API surface parity:** `sendMessage` gains an optional parameter — callers not passing it are unaffected. `UsageInfo` gains an optional field — existing code is unaffected.
- **Cost calculation:** Reasoning tokens are typically included within the provider's `outputTokens` count (not additive). `reasoningTokens` is informational — no change to `calculateCost` needed. Document this in a JSDoc comment on the field.

## Acceptance Criteria

- [ ] OpenAI with `reasoningEffort: "high"` reliably returns complete JSON without manual `maxTokens` override
- [ ] Truncated responses from any provider throw `VisualAITruncationError` with code `"RESPONSE_TRUNCATED"`, partial text, and current maxTokens
- [ ] Error message suggests increasing `maxTokens` or lowering `reasoningEffort`
- [ ] `result.usage.reasoningTokens` populated when provider reports thinking tokens
- [ ] OpenAI uses `json_schema` structured output when `responseSchema` is passed
- [ ] OpenAI falls back to `json_object` when no schema is passed (backward compat)
- [ ] Auto-increase only applies to OpenAI + high/xhigh + no explicit maxTokens
- [ ] User-specified `maxTokens` is never overridden
- [ ] All existing tests pass
- [ ] New unit tests for truncation detection, reasoning tokens, auto-increase, and structured output
- [ ] `VisualAITruncationError` exported from `src/index.ts`

## Dependencies & Risks

- **New dependency:** `zod-to-json-schema` for R4. Alternative: manual schema conversion, but error-prone for maintenance.
- **SDK field verification needed:** The exact field paths for reasoning tokens and truncation indicators must be verified against current SDK versions during implementation. The interfaces in the drivers are minimal abstractions — real SDK responses may have additional nesting.
- **Smoke tests essential:** Per documented learnings, mocked tests have historically missed real provider behavior differences. Smoke tests against real APIs (with deliberately low `maxTokens` like 50) should verify truncation detection works.
- **`json_schema` model support:** OpenAI's structured output requires model support. All known GPT-5.x models support it, but arbitrary model strings passed by users may not. The fallback to `json_object` when no schema is passed mitigates this — the driver uses `json_schema` only when the client explicitly provides a schema.

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-19-openai-truncation-fix-requirements.md](docs/brainstorms/2026-03-19-openai-truncation-fix-requirements.md) — Key decisions: all providers get truncation detection; structured output and auto-increase only for OpenAI; reasoning tokens exposed across all providers.

### Internal References

- Provider driver pattern: [src/providers/openai.ts](src/providers/openai.ts), [src/providers/anthropic.ts](src/providers/anthropic.ts), [src/providers/google.ts](src/providers/google.ts)
- Error taxonomy: [src/errors.ts](src/errors.ts)
- Usage flow: [src/core/debug.ts:40-56](src/core/debug.ts#L40-L56)
- Config resolution: [src/core/config.ts](src/core/config.ts)
- Response parsing: [src/core/response.ts](src/core/response.ts)
- Learnings on mocked test gaps: [docs/solutions/integration-issues/api-integration-bugs-undetectable-by-mocked-tests.md](docs/solutions/integration-issues/api-integration-bugs-undetectable-by-mocked-tests.md)
- Reasoning effort mapping: [docs/solutions/integration-issues/gemini-thinking-budget-to-thinking-level-migration.md](docs/solutions/integration-issues/gemini-thinking-budget-to-thinking-level-migration.md)
