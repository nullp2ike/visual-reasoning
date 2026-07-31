// Regenerates this example dataset: small synthetic "app screenshots" of a
// fictional app, each with one deliberate, describable visual defect. Kept in
// the repo so the benchmark pipeline is runnable on a fresh clone without any
// private screenshots. Deterministic — re-running yields byte-identical PNGs,
// so the stored manifest's sha256s stay valid.
//
//   node bench/datasets/example/generate.mjs bench/datasets/example
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

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * One screenshot of a fictional "Orbit" app. `opts` toggles the defects, so
 * every image is the same layout with one thing deliberately wrong.
 */
function screenshot(opts = {}) {
  const {
    title = "Orbit",
    balance = "1,240",
    ctaLabel = "Start now",
    navActive = 0,
    navLabels = ["Home", "Search", "Alerts", "Profile"],
    cards = 4,
    ctaTextColor = "#0f172a",
    balanceColor = TEXT,
    navMisaligned = false,
  } = opts;

  const parts = [];
  parts.push(`<rect width="${W}" height="${H}" fill="${BG}"/>`);

  // Header
  parts.push(`<rect x="0" y="0" width="${W}" height="72" fill="${CARD}"/>`);
  parts.push(
    `<text x="24" y="46" font-family="DejaVu Sans, Verdana, sans-serif" font-size="24" font-weight="bold" fill="${ACCENT}">${esc(title)}</text>`,
  );
  parts.push(
    `<text x="${W - 24}" y="46" text-anchor="end" font-family="DejaVu Sans, Verdana, sans-serif" font-size="20" fill="${balanceColor}">${esc(balance)}</text>`,
  );

  // Card grid
  const cols = 2;
  const cw = 200;
  const ch = 130;
  const gapX = 24;
  const gapY = 20;
  const x0 = (W - (cols * cw + gapX)) / 2;
  for (let i = 0; i < cards; i++) {
    const cx = x0 + (i % cols) * (cw + gapX);
    const cy = 110 + Math.floor(i / cols) * (ch + gapY);
    parts.push(`<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="12" fill="${CARD}"/>`);
    parts.push(
      `<circle cx="${cx + cw / 2}" cy="${cy + 52}" r="26" fill="${ACCENT}" opacity="0.35"/>`,
    );
    parts.push(
      `<text x="${cx + cw / 2}" y="${cy + 108}" text-anchor="middle" font-family="DejaVu Sans, Verdana, sans-serif" font-size="15" fill="${MUTED}">Item ${i + 1}</text>`,
    );
  }

  // Call to action
  const ctaY = 420;
  parts.push(`<rect x="60" y="${ctaY}" width="${W - 120}" height="52" rx="26" fill="${ACCENT}"/>`);
  parts.push(
    `<text x="${W / 2}" y="${ctaY + 34}" text-anchor="middle" font-family="DejaVu Sans, Verdana, sans-serif" font-size="19" font-weight="bold" fill="${ctaTextColor}">${esc(ctaLabel)}</text>`,
  );

  // Bottom navigation
  const navY = H - 72;
  parts.push(`<rect x="0" y="${navY}" width="${W}" height="72" fill="${CARD}"/>`);
  const slot = W / navLabels.length;
  navLabels.forEach((label, i) => {
    const cx = slot * i + slot / 2;
    const dy = navMisaligned && i === 2 ? 18 : 0;
    const on = i === navActive;
    parts.push(
      `<circle cx="${cx}" cy="${navY + 26 + dy}" r="11" fill="${on ? ACCENT : MUTED}"/>`,
      `<text x="${cx}" y="${navY + 57 + dy}" text-anchor="middle" font-family="DejaVu Sans, Verdana, sans-serif" font-size="12" fill="${on ? ACCENT : MUTED}">${esc(label)}</text>`,
    );
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join("")}</svg>`;
}

const IMAGES = {
  "clean.png": screenshot(),
  "cta_label_missing.png": screenshot({ ctaLabel: "" }),
  "balance_negative.png": screenshot({ balance: "-1,240", balanceColor: "#f87171" }),
  "nav_icon_misaligned.png": screenshot({ navMisaligned: true }),
  "cta_text_unreadable.png": screenshot({ ctaTextColor: ACCENT }),
};

const ISSUES = `# Expected issues per image

Each \`##\` heading is a filename in this directory; each \`-\` bullet below it is
one defect a model is expected to report for that image. A heading with a single
empty bullet is a negative control: the image is clean, so anything a model
reports there counts as a false positive.

## balance_negative.png

- The balance in the header shows a negative value (-1,240), which should never happen.

## clean.png

-

## cta_label_missing.png

- The main call-to-action button is empty: the button is rendered but has no label text.

## cta_text_unreadable.png

- The call-to-action button label is the same color as the button itself, so the text is invisible.

## nav_icon_misaligned.png

- The third item in the bottom navigation bar ("Alerts") sits lower than the other items instead of aligning with them.
`;

await mkdir(OUT, { recursive: true });
for (const [name, svg] of Object.entries(IMAGES)) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(join(OUT, name));
  console.log(`wrote ${name}`);
}
await writeFile(join(OUT, "issues_per_file.md"), ISSUES, "utf8");
console.log("wrote issues_per_file.md");
