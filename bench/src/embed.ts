import type { JudgeRequest } from "./judge.js";
import type { JudgeVerdict } from "./types.js";

/**
 * Produce one embedding vector per input text. The single seam every embedding
 * judge is built on: production supplies a Transformers.js-backed implementation
 * (see {@link loadEmbedder}); tests inject deterministic fakes.
 */
export type EmbedFn = (texts: readonly string[]) => Promise<number[][]>;

/** Judge ids of the form `embed:<id>` select the local embedding judge. */
export const EMBED_JUDGE_PREFIX = "embed:";

/**
 * Short judge id -> Hugging Face repo. All run fully locally via Transformers.js
 * (ONNX, no Python, no API key). `bge-small` is the default: 384-dim, ~33MB, and
 * strong on short-text English semantic similarity, which is exactly the
 * expected-vs-reported issue matching task.
 */
export const EMBED_MODELS: Readonly<Record<string, string>> = {
  "bge-small": "Xenova/bge-small-en-v1.5",
};

/**
 * F1-optimal cosine threshold on normalized `bge-small` embeddings, calibrated
 * against the gpt-5.6-terra judge's verdicts over 1458 examples (F1 0.908,
 * precision 0.895, recall 0.921; see `bench:calibrate-embed` and
 * bench/results/EMBED_CALIBRATION.md). A reported issue matches an expected one
 * when their cosine similarity is at least this value.
 */
export const EMBED_DEFAULT_THRESHOLD = 0.69;

export function isEmbeddingJudge(judgeModel: string): boolean {
  return judgeModel.startsWith(EMBED_JUDGE_PREFIX);
}

/** Resolve `embed:<id>` to its Hugging Face repo, or throw for an unknown id. */
export function embedModelRepo(judgeModel: string): string {
  const id = judgeModel.slice(EMBED_JUDGE_PREFIX.length);
  const repo = EMBED_MODELS[id];
  if (!repo) {
    const known = Object.keys(EMBED_MODELS)
      .map((k) => `${EMBED_JUDGE_PREFIX}${k}`)
      .join(", ");
    throw new Error(`Unknown embedding judge "${judgeModel}". Known: ${known}`);
  }
  return repo;
}

/** Cosine similarity of two equal-length vectors; 0 for a zero vector. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Minimal structural view of the Transformers.js surface we use, so the module
// typechecks without leaking `any` and mirrors the lazy-SDK pattern in
// src/providers/*.ts (import typed as a narrow local interface).
interface FeatureTensor {
  tolist(): number[][];
}
type FeatureExtractor = (
  texts: readonly string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<FeatureTensor>;
interface TransformersModule {
  pipeline(task: "feature-extraction", model: string): Promise<FeatureExtractor>;
}

// One embedder per repo per process: loading downloads/initializes the ONNX
// model once, then every judge call reuses it.
const embedderCache = new Map<string, Promise<EmbedFn>>();

/**
 * Build an {@link EmbedFn} backed by a Transformers.js feature-extraction
 * pipeline (mean-pooled, L2-normalized). The dependency is loaded dynamically so
 * non-embedding judges never pull it in, and a missing module surfaces a clear,
 * actionable error rather than a raw resolution failure.
 */
export function loadEmbedder(repo: string): Promise<EmbedFn> {
  const cached = embedderCache.get(repo);
  if (cached) return cached;

  const loading = (async (): Promise<EmbedFn> => {
    let mod: TransformersModule;
    try {
      mod = (await import("@huggingface/transformers")) as unknown as TransformersModule;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `The embedding judge needs @huggingface/transformers. Install it with ` +
          `"pnpm add -D @huggingface/transformers". Original error: ${detail}`,
      );
    }
    const extractor = await mod.pipeline("feature-extraction", repo);
    return async (texts) => {
      if (texts.length === 0) return [];
      const output = await extractor(texts, { pooling: "mean", normalize: true });
      return output.tolist();
    };
  })();

  embedderCache.set(repo, loading);
  return loading;
}

/**
 * Decide, from embeddings alone, which expected defects each report covers.
 *
 * For every expected issue, `matchedReportedIndexes` are the reported issues
 * whose description embeds within `threshold` cosine similarity; `found` is true
 * when at least one matches. Reported issues that match no expected issue become
 * `extraReportedIndexes`. Pure and dependency-free so it is unit-testable with
 * injected vectors; {@link loadEmbedder} supplies the real ones in production.
 */
export async function embeddingVerdict(
  request: JudgeRequest,
  embed: EmbedFn,
  threshold: number,
): Promise<JudgeVerdict> {
  const expectedTexts = request.expectedIssues;
  const reportedTexts = request.reportedIssues.map((i) => i.description);

  const vectors = await embed([...expectedTexts, ...reportedTexts]);
  const expectedVecs = vectors.slice(0, expectedTexts.length);
  const reportedVecs = vectors.slice(expectedTexts.length);

  const matchedGlobally = new Set<number>();
  const expected = expectedTexts.map((_, i) => {
    const self = expectedVecs[i] ?? [];
    let best = Number.NEGATIVE_INFINITY;
    let bestIndex = -1;
    const matched: number[] = [];
    reportedVecs.forEach((vec, j) => {
      const sim = cosine(self, vec);
      if (sim > best) {
        best = sim;
        bestIndex = j;
      }
      if (sim >= threshold) {
        matched.push(j);
        matchedGlobally.add(j);
      }
    });
    const found = matched.length > 0;
    const reasoning =
      reportedVecs.length === 0
        ? "No issues were reported."
        : found
          ? `cosine ${best.toFixed(2)} >= ${threshold.toFixed(2)} threshold (reported #${bestIndex})`
          : `best cosine ${best.toFixed(2)} < ${threshold.toFixed(2)} threshold`;
    return { expectedIndex: i, found, matchedReportedIndexes: matched, reasoning };
  });

  const extraReportedIndexes = reportedVecs.map((_, j) => j).filter((j) => !matchedGlobally.has(j));

  return { expected, extraReportedIndexes };
}
