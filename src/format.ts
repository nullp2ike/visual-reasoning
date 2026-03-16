import type { CheckResult, CompareResult } from "./types.js";
import { VisualAIAssertionError } from "./errors.js";

/**
 * Formats a check result into a readable multiline string for logs or test failures.
 *
 * @param result Structured result returned by `check()` or a template helper.
 * @param label Optional label appended to the output header.
 * @returns A human-readable summary of the check result.
 * @example
 * ```ts
 * console.log(formatCheckResult(result, "Checkout page"));
 * ```
 */
export function formatCheckResult(result: CheckResult, label?: string): string {
  if (result.pass) {
    const header = label ? `Visual AI Check Passed (${label})` : "Visual AI Check Passed";
    return `${header}\n${"=".repeat(header.length)}\n${result.reasoning}`;
  }

  const header = label ? `Visual AI Check Failed (${label})` : "Visual AI Check Failed";
  const lines: string[] = [header, "=".repeat(header.length), result.reasoning];

  if (result.statements.length > 0) {
    lines.push("", "Statements:");
    for (const s of result.statements) {
      const status = s.pass ? "PASS" : "FAIL";
      const confidence = s.confidence ? ` (${s.confidence})` : "";
      lines.push(`  ${status}  "${s.statement}"`);
      lines.push(`        ${s.reasoning}${confidence}`);
    }
  }

  if (result.issues.length > 0) {
    lines.push("", "Issues:");
    for (const issue of result.issues) {
      lines.push(`  [${issue.priority}/${issue.category}] ${issue.description}`);
      lines.push(`    → ${issue.suggestion}`);
    }
  }

  return lines.join("\n");
}

/**
 * Formats a compare result into a readable multiline string for logs or test failures.
 *
 * @param result Structured result returned by `compare()`.
 * @param label Optional label appended to the output header.
 * @returns A human-readable summary of the compare result.
 * @example
 * ```ts
 * console.log(formatCompareResult(result, "Before/after deploy"));
 * ```
 */
export function formatCompareResult(result: CompareResult, label?: string): string {
  const status = result.pass ? "Passed" : "Failed";
  const header = label ? `Visual AI Compare ${status} (${label})` : `Visual AI Compare ${status}`;
  const lines: string[] = [header, "=".repeat(header.length), result.reasoning];

  if (result.changes.length > 0) {
    lines.push("", "Changes:");
    for (const change of result.changes) {
      lines.push(`  [${change.severity}] ${change.description}`);
    }
  }

  if (result.diffImage) {
    const { width, height } = result.diffImage;
    lines.push("", `Diff image: ${width}x${height} (AI-generated)`);
  }

  return lines.join("\n");
}

/**
 * Throws a `VisualAIAssertionError` when a check result did not pass.
 *
 * @param result Structured result returned by `check()` or a template helper.
 * @param label Optional label appended to the assertion message.
 * @returns Nothing when the result passes.
 * @throws {VisualAIAssertionError} When `result.pass` is `false`.
 * @example
 * ```ts
 * assertVisualResult(result, "Homepage");
 * ```
 */
export function assertVisualResult(result: CheckResult, label?: string): void {
  if (!result.pass) {
    throw new VisualAIAssertionError(formatCheckResult(result, label), result);
  }
}

/**
 * Throws a `VisualAIAssertionError` when a compare result did not pass.
 *
 * @param result Structured result returned by `compare()`.
 * @param label Optional label appended to the assertion message.
 * @returns Nothing when the result passes.
 * @throws {VisualAIAssertionError} When `result.pass` is `false`.
 * @example
 * ```ts
 * assertVisualCompareResult(result, "Login flow");
 * ```
 */
export function assertVisualCompareResult(result: CompareResult, label?: string): void {
  if (!result.pass) {
    throw new VisualAIAssertionError(formatCompareResult(result, label), result);
  }
}
