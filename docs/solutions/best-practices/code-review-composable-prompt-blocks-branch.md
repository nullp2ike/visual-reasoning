---
title: "Code review findings: feat/composable-prompt-blocks branch"
category: best-practices
date: 2026-03-09
tags:
  - code-review
  - typescript
  - architecture
  - performance
  - security
---

# Code Review: feat/composable-prompt-blocks

**Branch:** feat/composable-prompt-blocks
**Date:** 2026-03-09
**Agents:** TypeScript, Security, Performance, Architecture, Agent-Native, Learnings, Simplicity

## P2 — Important

### 1. `query()` lacks `edgeCaseRules` — parity gap

- `src/core/client.ts:42` — `query(image, prompt)` has no options parameter
- `src/core/prompt.ts:136` — `buildQueryPrompt` already accepts options but client never passes them
- Fix: Either add `QueryOptions` to client or remove dead `options` param from `buildQueryPrompt`

### 2. Model/provider mismatch not validated

- `src/core/client.ts:142-145` — `{ provider: "google", model: "claude-sonnet-4-6" }` silently sends a Claude model to Google API
- Fix: Add validation in `createClient` using `inferProviderFromModel`

### 3. Hoist Zod `.omit()` schemas to module-level

- `src/core/response.ts:34-36` — `CheckResultSchema.omit({ usage: true })` creates new schema per call
- Fix: Hoist to module-level constants

### 4. `compare()` inline intersection

- `src/core/client.ts:46` — `options?: CompareOptions & { prompt?: string }` should move `prompt` into `CompareOptions`

### 5. `VisualAIAssertionError.result` typed `unknown`

- `src/errors.ts:60` — Should be `CheckResult | CompareResult`

### 6. `inferProviderFromModel` long line

- `src/core/client.ts:75` — Refactor to array-based prefix lookup

### 7. Remove `Math.round` in duration tracking

- `src/core/client.ts:165` — Loses sub-ms precision; `toFixed(3)` already handles display rounding

### 8. `NormalizedImage.data` Buffer unused

- `src/types.ts:150` — No provider uses `img.data`; all use `img.base64`. Doubles memory per image.

## P3 — Nice-to-have (not fixing now)

- SSRF protections on URL image loading (document trust boundary)
- `content.ts` missing default edge-case rules (inconsistent with other templates)
- `PRICING_TABLE` typed as `Record<string, ...>` (loses key validation)
- `ClientConfig.model` autocomplete via `KnownModelName | (string & {})`
- `buildQueryPrompt` dead options parameter (addressed by P2-1)
- Test env cleanup for `VISUAL_AI_MODEL` ad-hoc (should use afterEach)
- No `formatQueryResult` / `assertVisualQueryResult` helpers
