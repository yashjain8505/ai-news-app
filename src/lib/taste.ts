export type Weights = Record<string, number>;

const SOURCE_BONUS = 1.5;

// Score an item: sum of the user's weight for each tag, plus a bonus if the
// item's source is one the user explicitly trusts.
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
