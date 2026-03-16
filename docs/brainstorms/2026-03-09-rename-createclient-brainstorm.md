# Rename `createClient` to `visualAI`

**Date:** 2026-03-09
**Status:** Ready for planning

## What We're Building

Rename the main public API factory function from `createClient` to `visualAI`, and rename `ClientConfig` to `VisualAIConfig`. The goal is to make the library's entry point self-descriptive — when a test file imports and calls `visualAI(...)`, it's immediately clear what is being instantiated without relying on the package name for context.

## Why This Approach

- `createClient` is generic — it could be an HTTP client, DB client, etc. The name carries no domain meaning.
- `visualAI` is concise, domain-specific, and reads naturally as both a factory call (`visualAI({...})`) and a variable name (`const ai = visualAI({...})`).
- Dropping the `create` prefix follows the pattern of libraries like `express()`, `fastify()`, `zod.object()` — where the function name IS the thing, not `createApp`.
- `VisualAIConfig` aligns with the existing `VisualAI` prefix used throughout the codebase (`VisualAIClient`, `VisualAIError`).

## Key Decisions

1. **Factory function:** `createClient` → `visualAI`
2. **Config type:** `ClientConfig` → `VisualAIConfig`
3. **Interface type:** `VisualAIClient` stays unchanged (already well-named)
4. **No deprecation aliases** — clean break, pre-1.0 library
5. **Test variable names:** `client` → `ai` across all test files for natural readability

## Scope

### Files to change

- `src/core/client.ts` — rename function + type definitions
- `src/index.ts` — update re-exports
- `tests/core/client.test.ts` — rename describe block, variable names
- `tests/core/full-flow.test.ts` — update variable names
- `tests/templates/client-templates.test.ts` — update variable names
- `README.md` — update API reference to use new names
- Any smoke test files referencing `createClient`

### What stays the same

- `VisualAIClient` interface name
- All method names (`check`, `query`, `compare`, etc.)
- Internal `createDriver` helper (private, not exported)
- All prompt/template/provider code

## Open Questions

None — all decisions resolved.
