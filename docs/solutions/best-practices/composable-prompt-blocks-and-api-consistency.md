---
title: "Composable prompt blocks with domain roles, edge case rules, and consistent API surface"
category: best-practices
tags:
  - prompt-engineering
  - composable-architecture
  - type-safety
  - api-design
  - zod
  - breaking-change
  - visual-regression
module: src/core/prompt.ts, src/types.ts, src/core/response.ts, src/core/client.ts, src/templates/*
symptom: "Generic 'visual QA assistant' role across all templates; inconsistent model behavior on ambiguous cases; compare() returns CheckResult instead of purpose-built type; API surface has naming and structural inconsistencies"
root_cause: "Monolithic prompt construction with no domain context injection points; compare API reuses check types; no generic response parser; inconsistent option types and naming across public API"
severity: major
date: 2026-03-05
---

# Composable Prompt Blocks and API Consistency

## Problem Statement

The prompt templates in visual-ai-assertions had three structural weaknesses:

1. **No domain context** -- All 5 templates funneled through `buildCheckPrompt()` with a generic "visual QA assistant" role. The model received no signal about whether it was performing an accessibility audit vs. a layout review, limiting domain-specific reasoning.

2. **No edge case guidance** -- Prompts provided no rules for ambiguous visual scenarios (partially visible elements, borderline contrast, dark themes, scrollable containers). This caused inconsistent pass/fail results and false positives.

3. **Wrong return type for compare()** -- The compare function reused `CheckResult` (with `issues` and `statements` arrays) instead of a dedicated type. A visual diff produces _changes with severity_, not _pass/fail statements_.

Additionally, 6 parallel review agents identified API consistency issues:

- `compare()` took a positional `prompt` string while all other methods used options objects
- `check()` used an inline anonymous type instead of a named `CheckOptions` interface
- `MissingElementsOptions` lived in a template file instead of `src/types.ts` with all other option types
- Internal `CheckPromptOptions` used `edgeRules` while the public API used `edgeCaseRules`, causing translation boilerplate
- `compare()` didn't support custom edge rules while `check()` and `query()` did
- `content.ts` and `page-load.ts` had redundant empty-array checks

## Root Cause

- **Prompt builders had no extension points.** `buildCheckPrompt` produced a single prompt with no way to inject domain-specific roles or edge case rules.
- **`compare()` reused `CheckResult`.** The `issues` and `statements` arrays were semantically wrong for comparison results.
- **No generic response parser.** `parseCheckResponse` and `parseQueryResponse` were copy-pasted functions differing only in which Zod schema they applied.
- **No API design checklist.** Each method/template was added independently without a consistency check.

## Solution

### Composable prompt sections

Prompts are assembled from discrete sections joined with double newlines:

```typescript
export function buildCheckPrompt(
  statements: string | string[],
  options?: CheckPromptOptions,
): string {
  const sections = [options?.role ?? DEFAULT_CHECK_ROLE];

  if (options?.edgeCaseRules && options.edgeCaseRules.length > 0) {
    sections.push(buildEdgeRulesSection(options.edgeCaseRules));
  }

  sections.push(`Statements to evaluate:\n${statementsBlock}`);
  sections.push(CHECK_OUTPUT_SCHEMA);

  return sections.join("\n\n");
}
```

### Domain roles (not personas)

Each template defines a task-framing role. Research showed personas don't improve vision model accuracy -- task framing does:

```typescript
const ACCESSIBILITY_ROLE =
  "Evaluate this screenshot for visual accessibility. Focus on what you can actually perceive — apparent contrast levels, text legibility, and visual distinctiveness of interactive elements.";
```

### Edge case rules with append merge

User-supplied `edgeCaseRules` are appended to template defaults, never replacing them:

```typescript
const edgeRules = options?.edgeCaseRules
  ? [...TEMPLATE_EDGE_RULES, ...options.edgeCaseRules]
  : TEMPLATE_EDGE_RULES;
```

### CompareResult as separate type

```typescript
const BaseResultSchema = z.object({
  pass: z.boolean(),
  reasoning: z.string(),
  usage: UsageInfoSchema.optional(),
});

export const CompareResultSchema = BaseResultSchema.extend({
  changes: z.array(ChangeEntrySchema).max(50),
});

export const CheckResultSchema = BaseResultSchema.extend({
  issues: z.array(IssueSchema),
  statements: z.array(StatementResultSchema),
});
```

### Generic parseResponse<T>

Eliminated duplicated JSON-parse + Zod-validate logic:

```typescript
function parseResponse<T>(raw: string, schema: z.ZodType<T>): T {
  const parsed = JSON.parse(stripCodeFences(raw));
  const result = schema.safeParse(parsed);
  if (!result.success) throw new VisualAIResponseParseError(...);
  return result.data;
}
```

### Consistent API surface

- Named option types (`CheckOptions`, `CompareOptions`, `MissingElementsOptions`) in `src/types.ts`
- Options objects instead of positional params: `compare(imgA, imgB, { prompt?, edgeCaseRules? })`
- Unified `edgeCaseRules` naming at all layers (public API, internal prompt options, template callsites)
- Simplified passthrough: templates pass `edgeCaseRules: options?.edgeCaseRules` directly

## Key Design Decisions

| Decision                               | Rationale                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Task instructions, not personas        | Research shows personas don't improve vision model accuracy on visual tasks  |
| Append-only merge for edge rules       | Ensures template safety guardrails always apply; users extend, never replace |
| Separate CompareResult type            | Changes with severity models visual diffs better than pass/fail statements   |
| Confidence optional on StatementResult | Backward compatible; not all providers reliably produce confidence           |
| `readonly string[]` for edgeCaseRules  | Allows `as const` arrays without type errors                                 |

## Prevention: Adding a New Template

- [ ] Option type defined in `src/types.ts` (not in the template file)
- [ ] Option type includes `edgeCaseRules?: readonly string[]`
- [ ] Option type exported from `src/index.ts`
- [ ] Template has a `FOO_ROLE` domain-specific constant
- [ ] Template has `FOO_EDGE_RULES` if domain rules exist
- [ ] `CHECK_STATEMENTS` uses `Record<(typeof ALL_CHECKS)[number], string>` (not `Record<string, string>`)
- [ ] Template delegates to `buildCheckPrompt(statements, { role, edgeCaseRules })`
- [ ] No redundant defensive code (`buildCheckPrompt` handles undefined/empty edgeCaseRules)
- [ ] Template re-exported from `src/templates/index.ts`
- [ ] Tests at `tests/templates/foo.test.ts` cover defaults, custom edgeCaseRules, and role

## Prevention: Adding a New Client Method

- [ ] Uses options object for optional config (never positional params)
- [ ] Options type is a named interface from `src/types.ts` (never inline)
- [ ] Declared in `VisualAIClient` interface
- [ ] Follows standard pattern: normalizeImage → buildPrompt → debugLog → sendMessage → debugLog → parseResponse → processUsage
- [ ] Return type backed by a Zod schema; dedicated `parseFooResponse` in `response.ts`
- [ ] New types and schemas exported from `src/index.ts`
- [ ] Tests in `tests/core/client.test.ts`

## Prevention: Naming Consistency

A concept uses the same name at every layer. Name translation between layers is a bug:

| Concept                | Canonical name               |
| ---------------------- | ---------------------------- |
| User edge-case rules   | `edgeCaseRules`              |
| Template checks subset | `checks`                     |
| User free-form prompt  | `prompt` (on options object) |

If you rename a field during passthrough (`edgeRules: options?.edgeCaseRules`), one name is wrong -- fix it.

## Related Documentation

- [type-safety-and-code-deduplication-review.md](./type-safety-and-code-deduplication-review.md) -- Typed Record patterns, provider architecture DRY
- [per-call-api-cost-monitoring.md](./per-call-api-cost-monitoring.md) -- Centralized `processUsage()` pattern, optional `estimatedCost`
- [api-integration-bugs-undetectable-by-mocked-tests.md](../integration-issues/api-integration-bugs-undetectable-by-mocked-tests.md) -- `stripCodeFences()` origin, tiered assertion strategy, smoke test importance
