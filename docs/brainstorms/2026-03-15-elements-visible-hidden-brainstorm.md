# Brainstorm: Rename missingElements to elementsVisible / elementsHidden

**Date:** 2026-03-15
**Status:** Ready for planning

## What We're Building

Replace the `ai.missingElements()` method with two semantically accurate methods:

- **`ai.elementsVisible(image, elements, options?)`** — Asserts that the listed UI elements ARE visible on the page. Direct replacement for `missingElements`.
- **`ai.elementsHidden(image, elements, options?)`** — Asserts that the listed UI elements are NOT visible on the page. New inverse capability.

Both methods accept the same signature: an image, a string array of element names, and optional `edgeCaseRules`.

## Why This Approach

**Problem:** `missingElements` is semantically misleading. It checks whether elements are _visible_ (positive assertion), but the name implies it finds what's _missing_ (negative framing). The underlying statements are `"The element X is visible on the page"` — the opposite of what the method name suggests.

**Solution:** Rename to `elementsVisible` which accurately describes the behavior, and add `elementsHidden` as the natural inverse. This also fills a gap — there was previously no way to assert that elements should NOT be on screen.

**Naming rationale:**

- Subject-first (`elements*`) groups both methods together in autocomplete and documentation
- Consistent with existing template method style (single descriptive name)
- `elementsVisible` / `elementsHidden` reads naturally as an assertion

## Key Decisions

| Decision           | Choice                               | Rationale                                                                        |
| ------------------ | ------------------------------------ | -------------------------------------------------------------------------------- |
| Naming convention  | `elementsVisible` / `elementsHidden` | Subject-first groups alphabetically, reads naturally                             |
| Migration strategy | Hard breaking change                 | Clean API, no legacy baggage. Bump major version.                                |
| Hidden logic       | Simple inversion                     | Statement becomes "The element X is NOT visible on the page". Symmetric, simple. |
| Template structure | Shared template file                 | One template with a `visible: boolean` toggle. Two thin client methods. YAGNI.   |
| Scope              | Rename + add inverse                 | Fixes semantic accuracy AND adds missing capability                              |

## Implementation Sketch

### Template changes

- Rename `src/templates/missing-elements.ts` to `src/templates/elements-visibility.ts`
- Add a `visible: boolean` parameter to `buildElementsVisibilityPrompt()`
- When `visible: true`: statements are `"The element X is visible on the page"` (existing behavior)
- When `visible: false`: statements are `"The element X is NOT visible on the page"`
- Adjust edge-case rules per direction (e.g., partially visible = visible, partially visible != hidden)

### Client changes

- Remove `missingElements()` method from `VisualAIClient`
- Add `elementsVisible()` and `elementsHidden()` methods
- Both delegate to the shared template with the appropriate `visible` flag

### Type changes

- Rename `MissingElementsOptions` to `ElementsVisibilityOptions` (or keep shared, since both just have `edgeCaseRules`)
- Update `VisualAIClient` interface

### Constants / exports

- Update `src/index.ts` exports
- No new check-name constants needed (user-supplied element lists, same as before)

### Tests

- Rename/update `tests/templates/missing-elements.test.ts`
- Add test cases for hidden assertions
- Update client template tests

## Open Questions

None — all key decisions have been made.
