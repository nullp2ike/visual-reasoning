---
status: pending
priority: p3
issue_id: "013"
tags: [code-review, quality, dry]
dependencies: []
---

# Repetitive schema conversion pattern in client.ts

## Problem Statement

`client.ts` has three nearly identical blocks converting Zod schemas to JSON Schema via `zodToJsonSchema`. A small helper would reduce repetition and make adding new schemas easier.

## Findings

- `src/core/client.ts` — three module-level constants: `checkSchemaOptions`, `askSchemaOptions`, `compareSchemaOptions`
- Each follows the same pattern: `{ responseSchema: zodToJsonSchema(Schema, { target: "openAi" }) as Record<string, unknown> }`

## Proposed Solutions

### Solution A: Extract helper function (Recommended)

```typescript
function toSchemaOptions(schema: z.ZodType): SendMessageOptions {
  return {
    responseSchema: zodToJsonSchema(schema, { target: "openAi" }) as Record<string, unknown>,
  };
}
```

**Pros:** DRY, easy to add new schemas
**Cons:** Very minor — only 3 uses
**Effort:** Small
**Risk:** None

## Acceptance Criteria

- [ ] Helper function extracts the repetitive pattern
- [ ] All three schema options use the helper
- [ ] Tests still pass

## Work Log

| Date       | Action                   | Learnings |
| ---------- | ------------------------ | --------- |
| 2026-03-19 | Created from code review |           |
