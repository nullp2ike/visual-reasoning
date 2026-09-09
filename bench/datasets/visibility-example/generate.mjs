// Regenerates the visibility example dataset: one synthetic "app screenshot"
// of a fictional app, paired with a list of elements that ARE on the screen and
// a list of plausible elements that are NOT. Kept in the repo so the visibility
// benchmark runs on a fresh clone without any private screenshots.
// Deterministic — re-running yields a byte-identical PNG, so run records stay
// current (they carry the image sha256).
//
//   node bench/datasets/visibility-example/generate.mjs bench/datasets/visibility-example
//
// Run it from the repo root (it imports sharp from the project's node_modules).
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const OUT = process.argv[2];
const W = 480;
const H = 800;

const BG = "#0f172a";
const CARD = "#1e293b";
const TEXT = "#e2e8f0";
const MUTED = "#94a3b8";
const ACCENT = "#38bdf8";
const FONT = "DejaVu Sans, Verdana, sans-serif";

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The "Orbit" home screen. Every element listed as visible in
 * visibility_per_file.md is drawn well inside the frame: the library's
 * elementsVisible prompt fails an element that is cut off by the screenshot
 * boundary, so anything near an edge would make the ground truth ambiguous.
 */
function screenshot() {
  const parts = [];
  parts.push(`<rect width="${W}" height="${H}" fill="${BG}"/>`);

  // Header: app title (left) and account balance (right). No settings gear,
  // no back arrow — those are ground-truth absent elements.
  parts.push(`<rect x="0" y="0" width="${W}" height="72" fill="${CARD}"/>`);
  parts.push(
    `<text x="24" y="46" font-family="${FONT}" font-size="24" font-weight="bold" fill="${ACCENT}">Orbit</text>`,
  );
  parts.push(
    `<text x="${W - 24}" y="46" text-anchor="end" font-family="${FONT}" font-size="20" fill="${TEXT}">1,240</text>`,
  );

  // Search bar with a magnifier glyph and a "Search" placeholder.
  const searchY = 96;
  parts.push(
    `<rect x="24" y="${searchY}" width="${W - 48}" height="44" rx="22" fill="${CARD}" stroke="${MUTED}" stroke-width="1"/>`,
  );
  parts.push(
    `<circle cx="52" cy="${searchY + 21}" r="7" fill="none" stroke="${MUTED}" stroke-width="2"/>`,
  );
  parts.push(
    `<line x1="57" y1="${searchY + 26}" x2="63" y2="${searchY + 32}" stroke="${MUTED}" stroke-width="2" stroke-linecap="round"/>`,
  );
  parts.push(
    `<text x="78" y="${searchY + 28}" font-family="${FONT}" font-size="16" fill="${MUTED}">Search</text>`,
  );

  // 2x2 card grid.
  const cols = 2;
  const cw = 200;
  const ch = 130;
  const gapX = 24;
  const gapY = 20;
  const x0 = (W - (cols * cw + gapX)) / 2;
  for (let i = 0; i < 4; i++) {
    const cx = x0 + (i % cols) * (cw + gapX);
    const cy = 172 + Math.floor(i / cols) * (ch + gapY);
    parts.push(`<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="12" fill="${CARD}"/>`);
    parts.push(
      `<circle cx="${cx + cw / 2}" cy="${cy + 52}" r="26" fill="${ACCENT}" opacity="0.35"/>`,
    );
    parts.push(
      `<text x="${cx + cw / 2}" y="${cy + 108}" text-anchor="middle" font-family="${FONT}" font-size="15" fill="${MUTED}">Item ${i + 1}</text>`,
    );
  }

  // Call to action.
  const ctaY = 500;
  parts.push(`<rect x="60" y="${ctaY}" width="${W - 120}" height="52" rx="26" fill="${ACCENT}"/>`);
  parts.push(
    `<text x="${W / 2}" y="${ctaY + 34}" text-anchor="middle" font-family="${FONT}" font-size="19" font-weight="bold" fill="${BG}">Start now</text>`,
  );

  // Bottom navigation. Alerts carries no badge — that is a ground-truth absent
  // element, and the most tempting one for a model to hallucinate.
  const navY = H - 72;
  const navLabels = ["Home", "Search", "Alerts", "Profile"];
  parts.push(`<rect x="0" y="${navY}" width="${W}" height="72" fill="${CARD}"/>`);
  const slot = W / navLabels.length;
  navLabels.forEach((label, i) => {
    const cx = slot * i + slot / 2;
    const on = i === 0;
    parts.push(
      `<circle cx="${cx}" cy="${navY + 26}" r="11" fill="${on ? ACCENT : MUTED}"/>`,
      `<text x="${cx}" y="${navY + 57}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${on ? ACCENT : MUTED}">${esc(label)}</text>`,
    );
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join("")}</svg>`;
}

const GROUND_TRUTH = `# Element visibility per image

Each \`##\` heading is a filename in this directory. Under it, \`### visible\`
lists elements the screen is claimed to have and \`### absent\` ones it is claimed
to lack. Elements are sorted within each call, so their order says nothing about
the expected answers. Grading is deterministic: an element is correct when the
model's answer matches what the ground truth expects.

The section decides **which prompt asks**: \`### visible\` elements go through
\`elementsVisible()\` ("X is fully visible"), \`### absent\` ones through
\`elementsHidden()\` ("X is NOT visible").

A bullet may end with \`| TRUE\` or \`| FALSE\`, stating whether its section's
claim actually holds, and so deciding the expected answer. The default is TRUE.
\`| FALSE\` inverts it: "the Orbit chewing gum logo" describes something the
header does not contain, even though an Orbit title does, so under
\`### visible\` the model should answer that it is not visible. Each section here
carries at least one flagged bullet, so neither call can be passed by answering
the same way throughout. The flag is never sent to a model — only the
description is.

## orbit_home.png

### visible

- The "Orbit" app title in the header
- The "Orbit" chewing gum logo in the header | FALSE
- A search bar with the placeholder text "Search"
- A "Start now" call-to-action button
- A bottom navigation bar with Home, Search, Alerts and Profile tabs
- The balance "1,240" in the top-right of the header

### absent

- A settings gear icon in the header
- A red notification badge with a count on the Alerts tab
- A cookie consent banner at the bottom of the screen
- A back arrow in the top-left corner
- A grid of four content cards labelled "Item 1" to "Item 4" | FALSE
`;

await mkdir(OUT, { recursive: true });
await sharp(Buffer.from(screenshot()))
  .png({ compressionLevel: 9 })
  .toFile(join(OUT, "orbit_home.png"));
console.log("wrote orbit_home.png");
await writeFile(join(OUT, "visibility_per_file.md"), GROUND_TRUTH, "utf8");
console.log("wrote visibility_per_file.md");
