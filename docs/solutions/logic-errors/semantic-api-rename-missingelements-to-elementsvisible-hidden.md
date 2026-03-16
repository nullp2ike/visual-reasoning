---
title: "Semantic API rename: missingElements() to elementsVisible()/elementsHidden()"
severity: high
category: logic-errors
tags:
  [
    breaking-change,
    semantic-naming,
    api-surface,
    visual-assertions,
    typescript,
    code-duplication,
    prompt-engineering,
  ]
problem_type: misleading-api-semantics
modules: [client, templates, types]
date: 2026-03-15
---

# Semantic API Rename: missingElements() → elementsVisible()/elementsHidden()

## Problem Symptom

The `missingElements()` method name was semantically misleading — it implied "find what's missing" (a query) rather than "assert these are present" (a check). The naming also lacked an inverse assertion for verifying elements are hidden, forcing users to write custom `check()` calls for hidden-element assertions.

## Investigation Steps

1. **Brainstormed naming alternatives**: Evaluated `visibleElements`, `elementsPresent`, `elementsVisible` — chose subject-first (`elementsVisible`/`elementsHidden`) for alphabetical grouping with other template methods.
2. **Analyzed existing template patterns**: Studied `pageLoad` template's `expectLoaded` boolean toggle as precedent for direction-specific behavior in a single template.
3. **Evaluated partial visibility semantics**: Decided stricter behavior — partially visible elements fail BOTH `elementsVisible` (not fully visible) AND `elementsHidden` (not fully hidden).
4. **Tested prompt phrasing for AI accuracy**: Direction-specific roles and edge rules avoid double negation that confuses vision models.

## Root Cause

The original `missingElements()` API had three design issues:

1. **Misleading name**: "missing" implies a query ("what is missing?"), but the method is an assertion ("are these visible?").
2. **No inverse**: No way to assert elements are hidden without dropping to raw `check()`.
3. **Single prompt direction**: The template only checked for visibility, with no support for hidden-element assertions.

## Working Solution

### 1. New shared template with boolean toggle

Created `src/templates/elements-visibility.ts` replacing `src/templates/missing-elements.ts`:

```typescript
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

Key design decisions:

- **Direction-specific roles**: "present and fully visible" vs "absent or hidden" — avoids contradictory signals to the AI.
- **Direction-specific edge rules**: Partial visibility phrased without double negation per direction.

### 2. Private helper to eliminate duplication

Extracted `checkElementsVisibility()` inside the `visualAI()` factory:

```typescript
async function checkElementsVisibility(
  image: ImageInput,
  elements: string[],
  visible: boolean,
  options?: ElementsVisibilityOptions,
): Promise<CheckResult> {
  const methodName = visible ? "elementsVisible" : "elementsHidden";
  if (elements.length === 0) {
    throw new VisualAIConfigError(`At least one element is required for ${methodName}()`);
  }
  // ... normalize, prompt, send, parse, return
}
```

Two thin public methods delegate:

```typescript
elementsVisible(image, elements, options) {
  return checkElementsVisibility(image, elements, true, options);
},
elementsHidden(image, elements, options) {
  return checkElementsVisibility(image, elements, false, options);
},
```

### 3. Type rename

`MissingElementsOptions` → `ElementsVisibilityOptions` (shared by both methods, only contains `edgeCaseRules`).

### 4. Hard breaking change

No deprecation shim — clean break. Users update `missingElements()` → `elementsVisible()` and get `elementsHidden()` for free.

## Prevention Strategies

1. **Name methods as assertions, not queries**: Template methods should read as "assert X" not "find X". Use the pattern `<subject><Assertion>` (e.g., `elementsVisible`, `pageLoad`).
2. **Design inverse assertions upfront**: When adding an assertion, consider whether the inverse is needed. Adding both at once avoids a second breaking change later.
3. **Use direction-specific AI prompts**: When a template supports both positive and negative assertions, use separate role text and edge rules per direction to maximize AI accuracy.
4. **Extract shared helpers early**: When two public methods share >80% logic, extract a private helper with a boolean/enum toggle from the start.

## Cross-References

- Brainstorm: `docs/brainstorms/2026-03-15-elements-visible-hidden-brainstorm.md`
- Plan: `docs/plans/2026-03-15-feat-elements-visible-hidden-plan.md`
- Template pattern precedent: `src/templates/page-load.ts` (uses `expectLoaded` boolean toggle)
- Related solution: `docs/solutions/logic-errors/code-review-fixes-error-handling-validation-security.md`
