---
title: "feat: Export ReasoningEffort runtime constant for test consumers"
type: feat
status: active
date: 2026-03-19
---

# feat: Export ReasoningEffort runtime constant for test consumers

## Overview

Add a `ReasoningEffort` runtime constant object (matching the `Provider`, `Model`, `Content`, `Layout`, `Accessibility` pattern) so library consumers can reference reasoning effort values without hardcoding string literals in their tests.

## Problem Statement / Motivation

`ReasoningEffort` is currently a type-only export (`"low" | "medium" | "high" | "xhigh"`). Library consumers writing E2E tests must use raw strings:

```typescript
const client = visualAI({ reasoningEffort: "high" }); // string literal — no autocomplete, no typo safety
```

Every other domain concept in the library (`Provider`, `Model`, `Content`, `Layout`, `Accessibility`) has a runtime constant object. `ReasoningEffort` is the gap.

## Proposed Solution

### 1. Add runtime constant — `src/constants.ts`

Follow the exact pattern used by `Provider`:

```typescript
// src/constants.ts

/** Supported reasoning effort levels. */
export const ReasoningEffort = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  XHIGH: "xhigh",
} as const satisfies Record<string, ReasoningEffortType>;
```

Note: The `ReasoningEffort` type in `src/types.ts` will need to be renamed to avoid the name collision with the new constant. Rename it to `ReasoningEffortLevel` (or derive it from the constant, see option below).

**Preferred approach — derive the type from the constant:**

```typescript
// src/types.ts — remove the manual union type:
// - export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";
// + (deleted — now derived from constant)

// src/constants.ts — derive the type from the constant:
export const ReasoningEffort = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  XHIGH: "xhigh",
} as const;

/** Union of valid reasoning effort values, derived from the ReasoningEffort constant. */
export type ReasoningEffortLevel = (typeof ReasoningEffort)[keyof typeof ReasoningEffort];
```

This eliminates the duplication between the type and the constant values — single source of truth, matching how `KnownModelName` is derived from `Model` and `ContentCheckName` from `Content`.

### 2. Update internal imports

All files importing `ReasoningEffort` as a type must switch to `ReasoningEffortLevel`:

| File                      | Change                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`            | Remove `ReasoningEffort` type alias. Use `ReasoningEffortLevel` from `constants.ts` for the `reasoningEffort` field in `VisualAIConfig` |
| `src/providers/types.ts`  | Import `ReasoningEffortLevel` instead of `ReasoningEffort`                                                                              |
| `src/providers/google.ts` | Import `ReasoningEffortLevel` instead of `ReasoningEffort`                                                                              |
| `src/core/config.ts`      | Import `ReasoningEffortLevel` instead of `ReasoningEffort` (used in `parseReasoningEffortEnv` return type)                              |
| `src/constants.ts`        | Import nothing new — it defines the constant and derived type                                                                           |

### 3. Update public API barrel — `src/index.ts`

```typescript
// Add ReasoningEffort to the runtime constants export:
export {
  Provider,
  Model,
  Content,
  Layout,
  Accessibility,
  ReasoningEffort,
  DEFAULT_MODELS,
} from "./constants.js";

// Add ReasoningEffortLevel to the type-only constants export:
export type {
  KnownModelName,
  ContentCheckName,
  LayoutCheckName,
  AccessibilityCheckName,
  ReasoningEffortLevel,
} from "./constants.js";

// Remove ReasoningEffort from the type-only exports from types.js
// (it no longer exists there)
```

### 4. Consumer usage

After this change, library consumers can write:

```typescript
import { visualAI, ReasoningEffort } from "visual-ai-assertions";

const client = visualAI({
  reasoningEffort: ReasoningEffort.HIGH,
});
```

Or use the type for annotations:

```typescript
import type { ReasoningEffortLevel } from "visual-ai-assertions";

function getEffort(): ReasoningEffortLevel {
  return ReasoningEffort.HIGH;
}
```

## Technical Considerations

- **Naming**: The runtime constant takes the `ReasoningEffort` name (ergonomic for consumers), while the type becomes `ReasoningEffortLevel`. This mirrors `Provider` (constant) vs `ProviderName` (type).
- **Single source of truth**: Deriving the type from the constant means adding a new effort level only requires changing one place.
- **Breaking change**: Renaming the exported type from `ReasoningEffort` to `ReasoningEffortLevel` is a breaking change for consumers using `import type { ReasoningEffort }`. This is a minor semver bump since it's type-only. Alternatively, keep both names via a type alias: `export type ReasoningEffort = ReasoningEffortLevel;` — but this creates confusion between the constant and the type.
- **`PROVIDER_DEFAULT_REASONING` and `GOOGLE_THINKING_LEVEL`**: These maps are keyed by `ReasoningEffort` (the type). They must update to `ReasoningEffortLevel`.
- **`parseReasoningEffortEnv` validation array**: Currently `["low", "medium", "high", "xhigh"]` hardcoded in `config.ts`. Could be replaced with `Object.values(ReasoningEffort)` for single-source-of-truth, but the current approach is also fine.

## Acceptance Criteria

- [ ] `ReasoningEffort` runtime constant exported from `visual-ai-assertions` with keys `LOW`, `MEDIUM`, `HIGH`, `XHIGH`
- [ ] `ReasoningEffortLevel` type exported (derived from the constant, replacing the old `ReasoningEffort` type)
- [ ] All internal usage of the old `ReasoningEffort` type updated to `ReasoningEffortLevel`
- [ ] `GOOGLE_THINKING_LEVEL` and `PROVIDER_DEFAULT_REASONING` maps updated to use `ReasoningEffortLevel` as key type
- [ ] `parseReasoningEffortEnv` return type updated
- [ ] Existing tests pass without modification (they use string literals, not the type name)
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` passes

## Files to Modify

| File                      | Change                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/constants.ts`        | Add `ReasoningEffort` constant object and `ReasoningEffortLevel` derived type                                              |
| `src/types.ts`            | Remove `ReasoningEffort` type alias, import `ReasoningEffortLevel` from constants                                          |
| `src/index.ts`            | Export `ReasoningEffort` as runtime constant, export `ReasoningEffortLevel` type, remove old `ReasoningEffort` type export |
| `src/providers/types.ts`  | Update import from `ReasoningEffort` to `ReasoningEffortLevel`                                                             |
| `src/providers/google.ts` | Update import from `ReasoningEffort` to `ReasoningEffortLevel`                                                             |
| `src/core/config.ts`      | Update import and return type to `ReasoningEffortLevel`                                                                    |

## Sources

- Existing constant pattern: [constants.ts:6-10](src/constants.ts#L6-L10) (`Provider` constant with `as const satisfies`)
- Derived type pattern: [constants.ts:39-42](src/constants.ts#L39-L42) (`KnownModelName` derived from `Model`)
- Current type definition: [types.ts:132](src/types.ts#L132)
- Current type-only export: [index.ts:32](src/index.ts#L32)
- Institutional learning: `docs/solutions/best-practices/type-safety-and-code-deduplication-review.md` — use `Record<ReasoningEffort, ...>` pattern
