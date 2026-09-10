import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildElementsVisibilityPrompt } from "../../../src/templates/elements-visibility.js";
import {
  assertDatasetHasFile,
  datasetFrom,
  listDatasetIds,
  type Dataset,
} from "../../shared/dataset.js";
import { sha256 } from "../../shared/util.js";
import { assertionBenchConfig } from "../assertion.config.js";
import type { CallMode, VisibilityImage } from "./types.js";

/** The file inside a dataset directory that lists element visibility per image. */
export const VISIBILITY_FILE = "visibility_per_file.md";

/** One ground-truth bullet, after its optional truth flag has been resolved. */
export interface ParsedElement {
  /** The element description sent to the model. Any trailing flag is stripped. */
  element: string;
  /**
   * Which prompt asks about it, decided by the section it was listed under:
   * `### visible` bullets go through `elementsVisible()`, `### absent` bullets
   * through `elementsHidden()`. Independent of the expected answer.
   */
  askedAs: CallMode;
  /** Whether the model should report this element as on screen. */
  expectedVisible: boolean;
}

type Section = "visible" | "absent";

function isSection(value: string): value is Section {
  return value === "visible" || value === "absent";
}

const SECTION_MODE: Record<Section, CallMode> = { visible: "visible", absent: "hidden" };

/**
 * A trailing `| TRUE` / `| FALSE` on a bullet. Anchored to the end and matched
 * greedily, so only the last pipe can introduce a flag and an element whose
 * description itself contains a pipe ("A | B toggle") is left alone.
 */
const FLAG_RE = /^(.*)\|\s*(true|false)\s*$/i;

function parseBullet(text: string, lineNumber: number): { element: string; claimHolds: boolean } {
  const match = FLAG_RE.exec(text);
  if (!match) return { element: text, claimHolds: true };
  const element = (match[1] ?? "").trim();
  if (element.length === 0) {
    throw new Error(
      `${VISIBILITY_FILE} line ${lineNumber}: bullet has a "| ${(match[2] ?? "").toUpperCase()}" flag but no element description`,
    );
  }
  return { element, claimHolds: (match[2] ?? "").toLowerCase() === "true" };
}

/**
 * Parse visibility_per_file.md: `## <filename>` headings, each followed by
 * `### visible` and/or `### absent` sub-headings holding `- <element>` bullets.
 *
 * The section decides **which prompt asks**: `### visible` bullets are sent
 * through `elementsVisible()` ("X is fully visible"), `### absent` bullets
 * through `elementsHidden()` ("X is NOT visible"). It is a real difference in
 * what the model is asked, not just a label.
 *
 * A bullet may end with `| TRUE` or `| FALSE`, stating whether its section's
 * claim actually holds for that element, and so deciding the **expected
 * answer**. The flag defaults to TRUE. `| FALSE` under `### visible` marks a
 * statement that is false about the image; `| FALSE` under `### absent` marks
 * an element that is on screen after all. Without flags a section's expected
 * answers are uniform, which a model can pass by answering the same way
 * throughout — mix flags in to guard against that.
 *
 * The flag never reaches the model — only the description does — so toggling
 * one regrades existing runs without re-running them.
 *
 * Everything before the first `##` is prose and is ignored, so the file can
 * carry an explanatory header. Empty bullets are ignored: the screenshot
 * bench uses a bare `-` as its negative control, and that habit should not
 * silently create an empty element here.
 *
 * Ambiguity is an error rather than a guess — a mislabelled element would
 * silently score every model wrong on it.
 */
export function parseVisibilityMarkdown(markdown: string): Map<string, ParsedElement[]> {
  const byFile = new Map<string, ParsedElement[]>();
  let currentFile: string | undefined;
  let currentSection: Section | undefined;

  const lines = markdown.split("\n");
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;

    const fileHeading = /^##\s+(?!#)(.+?)\s*$/.exec(line);
    if (fileHeading?.[1]) {
      const filename = fileHeading[1];
      if (byFile.has(filename)) {
        throw new Error(`${VISIBILITY_FILE} line ${lineNumber}: duplicate heading "${filename}"`);
      }
      currentFile = filename;
      currentSection = undefined;
      byFile.set(filename, []);
      continue;
    }

    const sectionHeading = /^###\s+(.+?)\s*$/.exec(line);
    if (sectionHeading?.[1]) {
      const name = sectionHeading[1].toLowerCase();
      if (!currentFile) {
        throw new Error(
          `${VISIBILITY_FILE} line ${lineNumber}: "### ${sectionHeading[1]}" appears before any "## <filename>" heading`,
        );
      }
      if (!isSection(name)) {
        throw new Error(
          `${VISIBILITY_FILE} line ${lineNumber}: unknown section "### ${sectionHeading[1]}" (expected "### visible" or "### absent")`,
        );
      }
      currentSection = name;
      continue;
    }

    const bullet = /^-\s*(.*?)\s*$/.exec(line);
    if (!bullet) continue;
    const raw = bullet[1] ?? "";
    if (raw.length === 0) continue;
    if (!currentFile) continue;
    if (!currentSection) {
      throw new Error(
        `${VISIBILITY_FILE} line ${lineNumber}: bullet "${raw}" under "${currentFile}" is not inside a "### visible" or "### absent" section`,
      );
    }
    const entries = byFile.get(currentFile);
    if (!entries) throw new Error(`Internal: no entry for ${currentFile}`);

    const { element, claimHolds } = parseBullet(raw, lineNumber);
    if (entries.some((e) => e.element === element)) {
      throw new Error(
        `${VISIBILITY_FILE} line ${lineNumber}: element "${element}" is listed twice under "${currentFile}"`,
      );
    }
    entries.push({
      element,
      askedAs: SECTION_MODE[currentSection],
      // The section states a claim; the flag says whether it holds.
      expectedVisible: currentSection === "visible" ? claimHolds : !claimHolds,
    });
  }

  for (const [filename, entries] of byFile) {
    if (entries.length === 0) {
      throw new Error(
        `${VISIBILITY_FILE}: "${filename}" lists no elements. Every image needs at least one element under "### visible" or "### absent".`,
      );
    }
  }
  return byFile;
}

/**
 * Element descriptions for one prompt mode, sorted so the order carries no
 * information about which answers are expected within that call.
 */
export function elementsForMode(entries: readonly ParsedElement[], mode: CallMode): string[] {
  return entries
    .filter((e) => e.askedAs === mode)
    .map((e) => e.element)
    .sort();
}

/** Every element under test, sorted. Display and counting only. */
export function sortedElements(entries: readonly ParsedElement[]): string[] {
  return entries.map((e) => e.element).sort();
}

/**
 * Hash over both prompts the library will actually build for an image — the
 * `elementsVisible()` one and the `elementsHidden()` one. Hashing the built
 * prompts rather than the raw lists means an edit to either of the library's
 * own visibility prompts also marks existing records stale. An empty section
 * contributes an empty part, so adding the first bullet to it changes the hash.
 */
export function visibilityPromptHash(
  visibleCall: readonly string[],
  hiddenCall: readonly string[],
  requireCorrectRendering = true,
): string {
  return sha256(
    [
      visibleCall.length > 0
        ? buildElementsVisibilityPrompt([...visibleCall], true, { requireCorrectRendering })
        : "",
      // elementsHidden() ignores the option, so the hidden prompt never varies with it.
      hiddenCall.length > 0 ? buildElementsVisibilityPrompt([...hiddenCall], false) : "",
    ].join("\n--- hidden ---\n"),
  );
}

/**
 * The prompt hash a record must carry to be current for `image` under a given
 * rendering setting. `image.promptHash` is the default-setting hash, so this
 * only rebuilds the prompt for the presence-only variant.
 */
export function imagePromptHash(image: VisibilityImage, requireCorrectRendering: boolean): string {
  return requireCorrectRendering
    ? image.promptHash
    : visibilityPromptHash(image.visibleCall, image.hiddenCall, false);
}

/**
 * Pick the dataset for an assertion run. Unlike the discovery bench this does
 * not consult `BENCH_DATASET`: that variable names a dataset with
 * `issues_per_file.md`, which is usually not a visibility dataset.
 */
export function resolveAssertionDataset(explicit?: string): Dataset {
  return assertDatasetHasFile(
    datasetFrom(explicit ?? assertionBenchConfig.dataset),
    VISIBILITY_FILE,
  );
}

/** Where this bench's artifacts land, beside (never inside) the discovery bench's. */
export function assertionResultsDir(dataset: Dataset): string {
  return join(dataset.resultsDir, "assertion");
}

/** Dataset ids on disk that carry a visibility ground-truth file. */
export function listAssertionDatasetIds(): string[] {
  return listDatasetIds(VISIBILITY_FILE);
}

/**
 * Load and validate the ground truth for a dataset directory: parse the
 * markdown, check every named file exists, and hash the bytes and prompt so
 * stale run records can be detected later.
 */
export async function loadVisibilityGroundTruth(datasetDir: string): Promise<VisibilityImage[]> {
  const markdown = await readFile(join(datasetDir, VISIBILITY_FILE), "utf8");
  const parsed = parseVisibilityMarkdown(markdown);

  const missing = [...parsed.keys()].filter((filename) => !existsSync(join(datasetDir, filename)));
  if (missing.length > 0) {
    throw new Error(
      `${VISIBILITY_FILE} names ${missing.length} file(s) that do not exist in ${datasetDir}: ${missing.join(", ")}`,
    );
  }

  const images: VisibilityImage[] = [];
  for (const filename of [...parsed.keys()].sort()) {
    const entries = parsed.get(filename);
    if (!entries) throw new Error(`Internal: no entry for ${filename}`);
    const bytes = await readFile(join(datasetDir, filename));
    const visibleCall = elementsForMode(entries, "visible");
    const hiddenCall = elementsForMode(entries, "hidden");
    images.push({
      filename,
      sha256: sha256(bytes),
      visibleCall,
      hiddenCall,
      elements: sortedElements(entries),
      // Resolved expectations, after applying each bullet's truth flag.
      expectedVisible: entries.filter((e) => e.expectedVisible).map((e) => e.element),
      promptHash: visibilityPromptHash(visibleCall, hiddenCall),
    });
  }
  return images;
}
