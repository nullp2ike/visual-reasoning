import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { datasetDir } from "../../shared/util.js";

/**
 * The file inside a discovery dataset directory holding the question put to
 * every model. One dataset has exactly one prompt: to benchmark another
 * wording, make another dataset directory rather than a variant of this one.
 */
export const PROMPT_FILE = "prompt.md";

/**
 * Read the dataset's prompt. The file is sent verbatim apart from trailing
 * whitespace, so an editor adding a final newline never changes the prompt
 * hash that run records and the manifest are stamped with.
 */
export async function loadPrompt(dir: string = datasetDir()): Promise<string> {
  const path = join(dir, PROMPT_FILE);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `Missing ${path}: every discovery dataset needs a ${PROMPT_FILE} holding the question ` +
          `put to each model. See bench/datasets/README.md.`,
      );
    }
    throw error;
  }
  const prompt = text.trimEnd();
  if (prompt.length === 0) throw new Error(`${path} is empty`);
  return prompt;
}
