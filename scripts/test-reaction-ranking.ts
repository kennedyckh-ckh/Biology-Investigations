import assert from "node:assert/strict";
import { rankSharedResponses } from "../lib/reaction-ranking";

const responses = Object.freeze([
  { shareId: 103, seq: 3, reactions: { like: 0, heart: 5 } },
  { shareId: 102, seq: 2, reactions: { like: 3, heart: 1 } },
  { shareId: 101, seq: 1, reactions: { like: 3, heart: 0 } },
  { shareId: 104, seq: 4, reactions: { like: 0, heart: 0 } },
]);
const list = (order: Parameters<typeof rankSharedResponses>[1]) => rankSharedResponses(responses, order).map(({ item, rank }) => [item.seq, rank]);
assert.deepEqual(list("shared"), [[1, null], [2, null], [3, null], [4, null]]);
assert.deepEqual(list("stars"), [[1, 1], [2, 1], [3, 3], [4, 3]]);
assert.deepEqual(list("hearts"), [[3, 1], [2, 2], [1, 3], [4, 3]]);
assert.deepEqual(list("total"), [[3, 1], [2, 2], [1, 3], [4, 4]]);
assert.deepEqual(rankSharedResponses([], "stars"), []);
assert.deepEqual(responses.map((r) => r.seq), [3, 2, 1, 4]);
console.log("Reaction ranking: shared order, stars, hearts, totals, ties, empty list, and unchanged inputs.");
