import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const BugSeveritySchema = z.enum(["critical", "major", "minor"]);
export type BugSeverity = z.infer<typeof BugSeveritySchema>;

export const BugCategorySchema = z.enum([
  "functional",
  "visual",
  "layout",
  "content",
  "state",
  "navigation",
  "performance",
  "accessibility",
  "other",
]);
export type BugCategory = z.infer<typeof BugCategorySchema>;

/** One bug the model found in the recording. */
export const BugSchema = z.object({
  title: z.string().describe("Short one-line name for the bug."),
  severity: BugSeveritySchema,
  category: BugCategorySchema,
  startTimeSeconds: z
    .number()
    .nonnegative()
    .describe("Seconds from the start of the video at which the bug first becomes visible."),
  endTimeSeconds: z
    .number()
    .nonnegative()
    .nullable()
    .describe("Seconds at which the bug stops being visible, or null if it persists to the end."),
  screen: z.string().describe("Which screen, page, or dialog the bug is on."),
  observed: z.string().describe("What actually happens on screen, concretely."),
  expected: z.string().describe("What should have happened instead."),
  evidence: z
    .string()
    .describe(
      "The visual cues that show this is a bug, including every timestamp at which it recurs.",
    ),
  confidence: z.enum(["high", "medium", "low"]),
});
export type Bug = z.infer<typeof BugSchema>;

/** The full structured answer we ask the model for. */
export const BugReportSchema = z.object({
  summary: z
    .string()
    .describe("Two or three sentences: what the recording shows and the overall quality verdict."),
  userFlow: z
    .string()
    .describe("Brief chronological description of what the user does in the recording."),
  bugs: z.array(BugSchema),
});
export type BugReport = z.infer<typeof BugReportSchema>;

/**
 * JSON Schema handed to Gemini's `responseJsonSchema`. `$refStrategy: "none"`
 * inlines everything, which is what Gemini's structured-output subset expects.
 */
export function bugReportJsonSchema(): Record<string, unknown> {
  const schema = zodToJsonSchema(BugReportSchema, { $refStrategy: "none" }) as Record<
    string,
    unknown
  >;
  delete schema.$schema;
  return schema;
}

/** Human-readable description of the schema, appended to prompts. */
export const BUG_REPORT_OUTPUT_SECTION = `Respond with JSON only, matching this shape exactly:
{
  "summary": string,            // 2-3 sentences: what the recording shows and the overall verdict
  "userFlow": string,           // brief chronological description of what the user does
  "bugs": [
    {
      "title": string,          // one-line name
      "severity": "critical" | "major" | "minor",
      "category": "functional" | "visual" | "layout" | "content" | "state" | "navigation" | "performance" | "accessibility" | "other",
      "startTimeSeconds": number,        // when the bug first becomes visible
      "endTimeSeconds": number | null,   // when it stops being visible, or null if it persists
      "screen": string,         // which screen / page / dialog
      "observed": string,       // what actually happens
      "expected": string,       // what should have happened
      "evidence": string,       // the visual cues, incl. every timestamp where it recurs
      "confidence": "high" | "medium" | "low"
    }
  ]
}`;
