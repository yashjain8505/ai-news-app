export type Weights = Record<string, number>;

// Score an item by summing the user's weight for each of its tags.
export function scoreItem(
  tags: string[] | null | undefined,
  w: Weights | null
): number {
  if (!w || !tags) return 0;
  let s = 0;
  for (const t of tags) s += w[t] ?? 0;
  return s;
}
