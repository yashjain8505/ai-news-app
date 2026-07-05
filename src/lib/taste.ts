import { TOPICS } from "@/lib/topics";

export type Weights = Record<string, number>;

// SINGLE SOURCE OF TRUTH for the taste dimensions — the same reader-facing topics
// used by onboarding and the Tune page. If this drifts from topics.ts, saved
// weights stop matching the tags on the stories and scoreItem returns ~0 for
// everything, so the feed collapses to pure recency (same articles regardless of
// taste). Deriving it here keeps them locked together.
export const TAGS = TOPICS.map((t) => t.tag);

const SOURCE_BONUS = 1.5;

// Score an item: sum of the user's weight for each tag, plus a small bonus if the
// item's source is one the user explicitly trusts (sources currently unused).
export function scoreItem(
  tags: string[] | null | undefined,
  w: Weights | null,
  source?: string | null,
  sources?: string[] | null
): number {
  let s = 0;
  if (w && tags) for (const t of tags) s += w[t] ?? 0;
  if (source && sources && sources.includes(source)) s += SOURCE_BONUS;
  return s;
}

// --- engagement signal math ---------------------------------------------------

const CLICK_GAIN = 0.3;
const DWELL_GAIN = 0.8;
const DECAY = 0.99; // per-event pull back toward the onboarding prior

// A click is a weak, position-debiased nudge (top-slot clicks count less).
export function clickPerTag(rank: number, n: number): number {
  if (n <= 0) return 0;
  return (CLICK_GAIN / n) / (1 + 0.15 * rank);
}

function dwellMultiplier(ms: number): number | null {
  if (ms < 8000) return -0.3; // bounce
  if (ms < 30000) return 0.5; // skim
  if (ms < 180000) return 1.5; // real read
  if (ms <= 900000) return 2.0; // deep read
  return null; // walked away, discard
}

// Dwell is the dominant signal; it subsumes the click already applied so we
// don't double-count. Returns null when the time away is uninformative.
export function dwellPerTag(
  ms: number,
  rank: number,
  n: number,
  mobile: boolean
): number | null {
  if (n <= 0) return null;
  const m = dwellMultiplier(ms);
  if (m === null) return null;
  const dwell = ((DWELL_GAIN * m) / n) * (mobile ? 0.5 : 1);
  return dwell - clickPerTag(rank, n);
}

// Apply a per-tag delta to the raw affinity vector: gently decay every tag
// toward the frozen onboarding prior, clamp the event's total movement, floor at 0.
export function applyAffinity(
  affinity: Weights | null,
  prior: Weights | null,
  tags: string[],
  perTag: number
): Weights {
  const next: Weights = {};
  for (const t of TAGS) {
    const p = prior?.[t] ?? 0;
    const base = affinity?.[t] ?? p;
    next[t] = p + (base - p) * DECAY;
  }
  const total = perTag * tags.length;
  const factor = Math.abs(total) > 2 ? 2 / Math.abs(total) : 1;
  for (const t of tags) {
    if (!TAGS.includes(t)) continue;
    next[t] = Math.max(0, (next[t] ?? 0) + perTag * factor);
  }
  return next;
}

// Turn the raw affinity into the displayed/scoring mix: floor 2%, cap 35%, sum 100.
export function normalizeMix(affinity: Weights | null): Weights {
  const raw = TAGS.map((t) => Math.max(0, affinity?.[t] ?? 0));
  const total = raw.reduce((a, b) => a + b, 0);
  const pct: Weights = {};
  if (total <= 0) {
    TAGS.forEach((t) => (pct[t] = 10));
    return pct;
  }
  TAGS.forEach((t, i) => (pct[t] = Math.min(35, Math.max(2, (raw[i] / total) * 100))));
  const s = TAGS.reduce((a, t) => a + pct[t], 0);
  TAGS.forEach((t) => (pct[t] = Math.round((pct[t] * 100) / s)));
  return pct;
}
