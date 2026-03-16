---
title: "refactor: Rename createClient to visualAI"
type: refactor
status: completed
date: 2026-03-09
brainstorm: docs/brainstorms/2026-03-09-rename-createclient-brainstorm.md
---

# refactor: Rename `createClient` to `visualAI`

## Overview

Rename the public API factory function `createClient` → `visualAI` and its config type `ClientConfig` → `VisualAIConfig`. Clean break with no deprecated aliases. Also rename test variable `client` → `ai` for natural readability.

## Motivation

`createClient` is generic — it doesn't convey the visual assertion domain. `visualAI` is concise, domain-specific, and reads naturally: `const ai = visualAI({ provider: "anthropic" })`.

## Key Constraint

From [composable-prompt-blocks-and-api-consistency.md](../solutions/best-practices/composable-prompt-blocks-and-api-consistency.md): **use the same canonical name at every layer**. No name translation between layers — if a name appears in the public API, internal functions, and tests, it must be identical everywhere.

## Acceptance Criteria

- [x] `visualAI` is the only public factory function (no `createClient` export)
- [x] `VisualAIConfig` is the only config type (no `ClientConfig` export)
- [x] `VisualAIClient` interface unchanged
- [x] All tests pass (`pnpm test`)
- [x] Build succeeds (`pnpm build`)
- [x] Typecheck passes (`pnpm typecheck`)
- [x] Lint passes (`pnpm lint`)
- [x] README examples use `visualAI` and `ai` variable name

## Implementation

### Step 1: Rename source types and function

**`src/types.ts`**

- [x] Line 103: Rename `export interface ClientConfig` → `export interface VisualAIConfig`

**`src/core/client.ts`**

- [x] Line 7: Update import `ClientConfig` → `VisualAIConfig`
- [x] Lines 55, 83, 123, 130, 144: Update all `ClientConfig` type annotations → `VisualAIConfig`
- [x] Line 144: Rename `export function createClient(config: VisualAIConfig = {})` → `export function visualAI(config: VisualAIConfig = {})`

**`src/index.ts`**

- [x] Line 2: Update `export { createClient }` → `export { visualAI }`
- [x] Line 23: Update `ClientConfig` → `VisualAIConfig` in type re-export

### Step 2: Update test files

For each test file: update imports, rename `const client` → `const ai`, rename all `client.method()` → `ai.method()` calls.

**`tests/index.test.ts`**

- [x] Lines 5-6: Update export test from `createClient` → `visualAI`

**`tests/core/client.test.ts`**

- [x] Line 4: Update import `createClient` → `visualAI`
- [x] Line 80: Rename describe block `"createClient"` → `"visualAI"`
- [x] 36 instances: `const client = createClient(...)` → `const ai = visualAI(...)`
- [x] All `client.check`, `client.query`, `client.compare`, etc. → `ai.check`, `ai.query`, `ai.compare`

**`tests/core/client-templates.test.ts`**

- [x] Line 4: Update import
- [x] 8 instances: `const client` → `const ai`
- [x] All `client.method()` → `ai.method()` calls

**`tests/integration/full-flow.test.ts`**

- [x] Line 4: Update import
- [x] 12 instances: `const client` → `const ai`
- [x] All `client.method()` → `ai.method()` calls

**`tests/smoke/anthropic.smoke.test.ts`**

- [x] Line 9: Update import
- [x] Line 47: `const client` → `const ai`
- [x] All `client.method()` → `ai.method()` calls

**`tests/smoke/openai.smoke.test.ts`**

- [x] Same pattern as anthropic smoke test

**`tests/smoke/google.smoke.test.ts`**

- [x] Same pattern as anthropic smoke test

### Step 3: Update documentation

**`README.md`**

- [x] Lines 26, 57: Update imports `createClient` → `visualAI`
- [x] Lines 28, 59: Already uses `const ai = createClient(...)` → `const ai = visualAI(...)`
- [x] Line 83: Section heading `createClient(config)` → `visualAI(config)`
- [x] Line 88: `const client = createClient(...)` → `const ai = visualAI(...)`
- [x] Lines 98-293: All `client.method()` → `ai.method()` in code examples

**`CLAUDE.md`**

- [x] Line 42: Update naming example from `createClient` → `visualAI`

### Step 4: Verify

- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm test`
- [x] `pnpm build`

## Out of Scope

- Historical docs under `docs/plans/`, `docs/solutions/`, `docs/brainstorms/` — these are snapshots in time
- Internal `createDriver` helper — private, not exported
- Provider-internal `const client` variables (SDK instances in `src/providers/*.ts`)
- `VisualAIClient` interface — already well-named, no change

## References

- Brainstorm: [2026-03-09-rename-createclient-brainstorm.md](../brainstorms/2026-03-09-rename-createclient-brainstorm.md)
- Naming consistency learning: [composable-prompt-blocks-and-api-consistency.md](../solutions/best-practices/composable-prompt-blocks-and-api-consistency.md)
