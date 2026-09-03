import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

/**
 * Builds a synthetic "screen recording" from the committed example screenshot
 * dataset so the video harness can be exercised on a fresh clone without any
 * private footage. The clip cuts between the clean page and four defective
 * variants; the sidecar `example.expected.md` records what a perfect answer
 * would report and when.
 */
const execFileAsync = promisify(execFile);

const DATASET_DIR = resolve("bench/datasets/example");
const OUT_DIR = resolve("bench/video/videos");
const OUT_FILE = join(OUT_DIR, "example.mp4");
const FRAME_RATE = 10;

interface Segment {
  readonly file: string;
  readonly seconds: number;
  /** What a model should report for this segment; omitted for clean segments. */
  readonly bug?: string;
}

const SEGMENTS: readonly Segment[] = [
  { file: "clean.png", seconds: 3 },
  {
    file: "cta_label_missing.png",
    seconds: 2,
    bug: "The main call-to-action button is empty: the button is rendered but has no label text.",
  },
  { file: "clean.png", seconds: 2 },
  {
    file: "nav_icon_misaligned.png",
    seconds: 2,
    bug: 'The third item in the bottom navigation bar ("Alerts") sits lower than the other items instead of aligning with them.',
  },
  {
    file: "cta_text_unreadable.png",
    seconds: 2,
    bug: "The call-to-action button label is the same color as the button itself, so the text is invisible.",
  },
  { file: "clean.png", seconds: 1 },
  {
    file: "balance_negative.png",
    seconds: 3,
    bug: "The balance in the header shows a negative value (-1,240), which should never happen.",
  },
];

async function ffmpegPath(): Promise<string> {
  const mod = (await import("@ffmpeg-installer/ffmpeg")) as {
    path?: string;
    default?: { path: string };
  };
  const path = mod.path ?? mod.default?.path;
  if (!path) throw new Error("@ffmpeg-installer/ffmpeg did not expose a binary path");
  return path;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const inputArgs = SEGMENTS.flatMap((segment) => [
    "-loop",
    "1",
    "-framerate",
    String(FRAME_RATE),
    "-t",
    String(segment.seconds),
    "-i",
    join(DATASET_DIR, segment.file),
  ]);
  const concatInputs = SEGMENTS.map((_, index) => `[${index}:v]`).join("");
  const filter = `${concatInputs}concat=n=${SEGMENTS.length}:v=1:a=0,format=yuv420p[v]`;

  const ffmpeg = await ffmpegPath();
  await execFileAsync(ffmpeg, [
    "-y",
    ...inputArgs,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-r",
    String(FRAME_RATE),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    OUT_FILE,
  ]);

  let cursor = 0;
  const expectedLines: string[] = [
    "Synthetic clip cut from `bench/datasets/example/`. Each bug is visible only during its segment;",
    "the clean page is shown in between. A perfect answer lists exactly these four bugs at these times",
    "and nothing else.",
    "",
    "| From | To | Expected bug |",
    "| - | - | - |",
  ];
  for (const segment of SEGMENTS) {
    const from = cursor;
    cursor += segment.seconds;
    if (segment.bug) expectedLines.push(`| ${from}s | ${cursor}s | ${segment.bug} |`);
  }
  await writeFile(join(OUT_DIR, "example.expected.md"), expectedLines.join("\n") + "\n", "utf8");

  console.log(`Wrote ${OUT_FILE} (${cursor} s) and example.expected.md`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
