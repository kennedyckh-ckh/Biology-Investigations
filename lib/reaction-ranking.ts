export type ReactionOrder = "shared" | "stars" | "hearts" | "total";
type SharedResponse = { seq: number; shareId: number; reactions: { like: number; heart: number } };

export function rankSharedResponses<T extends SharedResponse>(items: readonly T[], order: ReactionOrder) {
  const score = (item: T) => order === "stars" ? item.reactions.like : order === "hearts" ? item.reactions.heart : item.reactions.like + item.reactions.heart;
  const sharedOrder = (a: T, b: T) => a.seq - b.seq || a.shareId - b.shareId;
  const sorted = [...items].sort((a, b) => (order === "shared" ? 0 : score(b) - score(a)) || sharedOrder(a, b));
  let rank = 0;
  return sorted.map((item, index) => {
    if (index === 0 || score(item) !== score(sorted[index - 1])) rank = index + 1;
    return { item, rank: order === "shared" ? null : rank };
  });
}
