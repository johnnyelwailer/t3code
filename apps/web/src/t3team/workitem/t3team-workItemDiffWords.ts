/**
 * The word-level LCS diff behind a proposed-description review.
 *
 * Its own module: a self-contained algorithm with a cost profile worth stating, separate from the decisions
 * about how a document is BLOCKED and how segments are attributed back to those blocks.
 *
 * `words` keeps the whitespace runs as their own tokens, because the renderer needs them to reproduce the
 * author's spacing — the diff marks only the tokens that carry text.
 */

import type { T3TeamDiffSegment } from "~/t3team/workitem/t3team-WorkItemDiffPrimitives";

export function words(text: string): ReadonlyArray<string> {
  return text.split(/(\s+)/).filter((token) => token.length > 0);
}

/**
 * Longest-common-subsequence word diff. O(n*m) — fine for a ticket description, not for a novel; a
 * long enough document should fall back to a magnitude-only summary rather than call this.
 */
export function diffWords(
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>,
): ReadonlyArray<T3TeamDiffSegment> {
  const rows = before.length;
  const cols = after.length;
  const lengths: number[][] = Array.from({ length: rows + 1 }, () =>
    Array.from({ length: cols + 1 }, () => 0),
  );

  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        before[i] === after[j] ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }

  const segments: T3TeamDiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (before[i] === after[j]) {
      segments.push({ text: before[i]! });
      i += 1;
      j += 1;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      segments.push({ text: before[i]!, kind: "del" });
      i += 1;
    } else {
      segments.push({ text: after[j]!, kind: "add" });
      j += 1;
    }
  }
  while (i < rows) {
    segments.push({ text: before[i]!, kind: "del" });
    i += 1;
  }
  while (j < cols) {
    segments.push({ text: after[j]!, kind: "add" });
    j += 1;
  }

  return segments;
}
