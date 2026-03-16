---
title: "feat: Replace missingElements with elementsVisible/elementsHidden"
type: feat
status: completed
date: 2026-03-15
---

# feat: Replace missingElements with elementsVisible/elementsHidden

## Overview

Replace the semantically misleading `missingElements()` method with two accurate, symmetric methods: `elementsVisible()` and `elementsHidden()`. This is a breaking change requiring a major version bump.

## Problem Statement / Motivation

`missingElements` checks whether elements ARE visible, but the name implies it finds what's missing. The underlying statements are `"The element X is visible on the page"` — the opposite of what the name suggests. There is also no way to assert elements should NOT be on screen.

## Proposed Solution

- **`elementsVisible(image, elements, options?)`** — Asserts listed elements are fully visible. Replaces `missingElements`.
- **`elementsHidden(image, elements, options?)`** — Asserts listed elements are NOT visible. New inverse capability.
- Hard breaking change: `missingElements` is removed entirely (no deprecation alias, no helpful error).
- Shared template file with a `visible: boolean` toggle.
- Partially visible elements now fail BOTH checks (behavior change from current — previously treated as visible/pass).

## Key Decisions

| Decision                       | Choice                                        | Rationale                                                     |
| ------------------------------ | --------------------------------------------- | ------------------------------------------------------------- |
| Method names                   | `elementsVisible` / `elementsHidden`          | Subject-first groups alphabetically                           |
| Migration                      | Hard break, no deprecation                    | Clean API, bump major version                                 |
| Template structure             | Single shared file, `visible: boolean` toggle | Follows `pageLoad` precedent with `expectLoaded`              |
| Role string                    | Adapts per direction                          | Prevents contradictory signals to AI                          |
| Edge rule (partial visibility) | Fails both checks                             | Stricter: partially visible is neither "visible" nor "hidden" |
| Issue category                 | Reuse `missing-element`                       | Avoids schema change                                          |
| Options type                   | Shared `ElementsVisibilityOptions`            | Both methods only need `edgeCaseRules`                        |

## Technical Approach

### Files to create

#### `src/templates/elements-visibility.ts`

Replaces `src/templates/missing-elements.ts`. Single exported function with `visible` toggle:

```typescript
// src/templates/elements-visibility.ts
import type { ElementsVisibilityOptions } from "../types.js";
import { buildCheckPrompt } from "../core/prompt.js";

const ELEMENTS_VISIBLE_ROLE =
  "Check whether specific UI elements are present and fully visible in this screenshot.";

const ELEMENTS_HIDDEN_ROLE =
  "Check whether specific UI elements are absent or hidden in this screenshot.";

const ELEMENTS_VISIBLE_EDGE_RULES: readonly string[] = [
  "If an element is partially visible (cut off by screenshot boundary), it is NOT considered fully visible — the check for that element should fail. Note the partial visibility in your reasoning.",
];

const ELEMENTS_HIDDEN_EDGE_RULES: readonly string[] = [
  "If an element is partially visible (cut off by screenshot boundary), it is NOT considered hidden — the check for that element should fail. Note the partial visibility in your reasoning.",
];

export function buildElementsVisibilityPrompt(
  elements: string[],
  visible: boolean,
  options?: ElementsVisibilityOptions,
): string {
  const statements = visible
    ? elements.map((el) => `The element "${el}" is fully visible on the page`)
    : elements.map((el) => `The element "${el}" is NOT visible on the page`);

  const defaultRules = visible ? ELEMENTS_VISIBLE_EDGE_RULES : ELEMENTS_HIDDEN_EDGE_RULES;
  const edgeRules = options?.edgeCaseRules
    ? [...defaultRules, ...options.edgeCaseRules]
    : defaultRules;

  return buildCheckPrompt(statements, {
    role: visible ? ELEMENTS_VISIBLE_ROLE : ELEMENTS_HIDDEN_ROLE,
    edgeCaseRules: edgeRules,
  });
}
```

Key changes from current `buildMissingElementsPrompt`:

- Takes `visible: boolean` parameter (similar to `pageLoad`'s `expectLoaded`)
- Role string adapts per direction
- Separate edge rules per direction (no double negation)
- Statement text changes: "fully visible" (stricter) vs "NOT visible"
- Removed empty-elements fallback (client validates before calling)

#### `tests/templates/elements-visibility.test.ts`

```typescript
// tests/templates/elements-visibility.test.ts
import { describe, it, expect } from "vitest";
import { buildElementsVisibilityPrompt } from "../../src/templates/elements-visibility.js";

describe("buildElementsVisibilityPrompt", () => {
  describe("visible: true", () => {
    it("includes element names in statements", () => {
      const prompt = buildElementsVisibilityPrompt(["Login button", "Header"], true);
      expect(prompt).toContain('"Login button" is fully visible');
      expect(prompt).toContain('"Header" is fully visible');
    });

    it("generates one statement per element", () => {
      const prompt = buildElementsVisibilityPrompt(["A", "B", "C"], true);
      expect(prompt).toContain("1.");
      expect(prompt).toContain("2.");
      expect(prompt).toContain("3.");
    });

    it("includes visible role text", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true);
      expect(prompt).toContain("present and fully visible");
    });

    it("includes default visible edge rules", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true);
      expect(prompt).toContain("NOT considered fully visible");
    });

    it("appends user-provided edge rules", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], true, {
        edgeCaseRules: ["Custom rule"],
      });
      expect(prompt).toContain("Custom rule");
      expect(prompt).toContain("NOT considered fully visible");
    });
  });

  describe("visible: false", () => {
    it("includes NOT visible statements", () => {
      const prompt = buildElementsVisibilityPrompt(["Spinner", "Modal"], false);
      expect(prompt).toContain('"Spinner" is NOT visible');
      expect(prompt).toContain('"Modal" is NOT visible');
    });

    it("includes hidden role text", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], false);
      expect(prompt).toContain("absent or hidden");
    });

    it("includes default hidden edge rules", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], false);
      expect(prompt).toContain("NOT considered hidden");
    });

    it("appends user-provided edge rules", () => {
      const prompt = buildElementsVisibilityPrompt(["X"], false, {
        edgeCaseRules: ["Custom rule"],
      });
      expect(prompt).toContain("Custom rule");
      expect(prompt).toContain("NOT considered hidden");
    });
  });
});
```

### Files to modify

#### `src/types.ts` (lines 143-145)

Rename `MissingElementsOptions` to `ElementsVisibilityOptions`:

```typescript
// Before:
export interface MissingElementsOptions {
  edgeCaseRules?: readonly string[];
}

// After:
export interface ElementsVisibilityOptions {
  edgeCaseRules?: readonly string[];
}
```

#### `src/core/client.ts`

**Interface** (lines 45-49) — replace `missingElements` with two methods:

```typescript
// Before:
missingElements(image: ImageInput, elements: string[], options?: MissingElementsOptions): Promise<CheckResult>;

// After:
elementsVisible(image: ImageInput, elements: string[], options?: ElementsVisibilityOptions): Promise<CheckResult>;
elementsHidden(image: ImageInput, elements: string[], options?: ElementsVisibilityOptions): Promise<CheckResult>;
```

**Imports** — update:

- `MissingElementsOptions` → `ElementsVisibilityOptions`
- `buildMissingElementsPrompt` → `buildElementsVisibilityPrompt`

**Implementation** (lines 250-267) — replace `missingElements` method with two methods:

```typescript
async elementsVisible(image, elements, options) {
  if (elements.length === 0) {
    throw new VisualAIConfigError("At least one element is required for elementsVisible()");
  }

  const img = await normalizeImage(image);
  const prompt = buildElementsVisibilityPrompt(elements, true, options);
  debugLog(config, "elementsVisible prompt", prompt);

  const response = await timedSendMessage([img], prompt);
  debugLog(config, "elementsVisible response", response.text);

  const result = parseCheckResponse(response.text);
  return {
    ...result,
    usage: processUsage("elementsVisible", response.usage, response.durationSeconds),
  };
},

async elementsHidden(image, elements, options) {
  if (elements.length === 0) {
    throw new VisualAIConfigError("At least one element is required for elementsHidden()");
  }

  const img = await normalizeImage(image);
  const prompt = buildElementsVisibilityPrompt(elements, false, options);
  debugLog(config, "elementsHidden prompt", prompt);

  const response = await timedSendMessage([img], prompt);
  debugLog(config, "elementsHidden response", response.text);

  const result = parseCheckResponse(response.text);
  return {
    ...result,
    usage: processUsage("elementsHidden", response.usage, response.durationSeconds),
  };
},
```

#### `src/templates/index.ts` (line 1)

```typescript
// Before:
export { buildMissingElementsPrompt } from "./missing-elements.js";

// After:
export { buildElementsVisibilityPrompt } from "./elements-visibility.js";
```

#### `src/index.ts` (line 40)

```typescript
// Before:
MissingElementsOptions,

// After:
ElementsVisibilityOptions,
```

#### `tests/core/client-templates.test.ts`

- Line 49-61: Replace `missingElements()` test with `elementsVisible()` test
- Add new test for `elementsHidden()` method
- Lines 128-151: Update the method iteration list from `"missingElements"` to `"elementsVisible"`, add `"elementsHidden"` to the list, update the special-case branching for the elements argument

#### `tests/index.test.ts`

- Update export assertions: remove `MissingElementsOptions`, add `ElementsVisibilityOptions`

### Files to delete

- `src/templates/missing-elements.ts` — replaced by `src/templates/elements-visibility.ts`
- `tests/templates/missing-elements.test.ts` — replaced by `tests/templates/elements-visibility.test.ts`

## Acceptance Criteria

- [x] `ai.elementsVisible(image, ["Login button"])` returns `CheckResult` with `pass: true` when element is fully visible
- [x] `ai.elementsVisible(image, ["Login button"])` returns `pass: false` when element is partially visible (behavior change)
- [x] `ai.elementsHidden(image, ["Spinner"])` returns `pass: true` when element is not on screen
- [x] `ai.elementsHidden(image, ["Spinner"])` returns `pass: false` when element is partially or fully visible
- [x] Both methods throw `VisualAIConfigError` for empty elements array
- [x] `MissingElementsOptions` type no longer exported; `ElementsVisibilityOptions` exported instead
- [x] `missingElements` method does not exist on `VisualAIClient`
- [x] All existing tests pass (updated for new names)
- [x] New tests cover both visible and hidden paths, including edge rules
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass

## Implementation Order

1. **Tests first**: Create `tests/templates/elements-visibility.test.ts` with tests for both `visible: true` and `visible: false`
2. **Template**: Create `src/templates/elements-visibility.ts` — make template tests pass
3. **Types**: Rename `MissingElementsOptions` → `ElementsVisibilityOptions` in `src/types.ts`
4. **Template barrel**: Update `src/templates/index.ts` export
5. **Client**: Update `VisualAIClient` interface and implementation in `src/core/client.ts`
6. **Public exports**: Update `src/index.ts`
7. **Client tests**: Update `tests/core/client-templates.test.ts`
8. **Export tests**: Update `tests/index.test.ts`
9. **Cleanup**: Delete `src/templates/missing-elements.ts` and `tests/templates/missing-elements.test.ts`
10. **Verify**: Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

## Dependencies & Risks

- **Breaking change**: Requires major version bump. All consumers must update `missingElements` → `elementsVisible`.
- **Behavior change**: Partially visible elements now fail `elementsVisible` (previously passed). This is intentionally stricter.
- **Issue category**: Reusing `missing-element` for `elementsHidden` failures is semantically loose but avoids a schema change. Can revisit if users report confusion.

## References

- Brainstorm: [docs/brainstorms/2026-03-15-elements-visible-hidden-brainstorm.md](docs/brainstorms/2026-03-15-elements-visible-hidden-brainstorm.md)
- Current template: [src/templates/missing-elements.ts](src/templates/missing-elements.ts)
- Client implementation: [src/core/client.ts:250-267](src/core/client.ts#L250-L267)
- `pageLoad` precedent (boolean toggle pattern): [src/templates/page-load.ts](src/templates/page-load.ts)
- Learnings on API consistency: [docs/solutions/best-practices/composable-prompt-blocks-and-api-consistency.md](docs/solutions/best-practices/composable-prompt-blocks-and-api-consistency.md)
