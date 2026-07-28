import type { T3TeamDiffSegment } from "~/t3team/workitem/t3team-WorkItemDiffPrimitives";

/**
 * A real (if modest) diff for a proposed description/comment: word-level, on plain text.
 *
 * The rich per-node-type diff `t3team-WorkItemDiffPrimitives.tsx` was built for (tables by cell, code
 * by line, media not at all) needs an ADF-aware block model this repo does not have yet — that is
 * its own slice. This computes the same *shape* of result (add/del word segments, paragraph blocks)
 * from the plain text a draft already carries, so the real primitives render something true rather
 * than nothing at all.
 */

export type DraftDiffParagraph = {
  readonly id: string;
  readonly segments: ReadonlyArray<T3TeamDiffSegment>;
  readonly state?: "add" | "del" | "edit";
};

export type DraftDiffMagnitude = { readonly added: number; readonly removed: number };

function words(text: string): ReadonlyArray<string> {
  return text.split(/(\s+)/).filter((token) => token.length > 0);
}

/**
 * Longest-common-subsequence word diff. O(n*m) — fine for a ticket description, not for a novel; a
 * long enough document should fall back to a magnitude-only summary rather than call this.
 */
function diffWords(
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

/** One paragraph per blank-line-separated chunk, in order of first appearance in `after`. */
function splitParagraphs(text: string): ReadonlyArray<string> {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/** Word-level diff, one block per paragraph. `before` is `undefined` for a brand-new document (a
 *  proposed comment), which reads as every paragraph being wholly added. */
export function buildDraftDiffParagraphs(
  before: string | undefined,
  after: string,
): ReadonlyArray<DraftDiffParagraph> {
  const beforeParagraphs = before ? splitParagraphs(before) : [];
  const afterParagraphs = splitParagraphs(after);
  const segments = diffWords(words(beforeParagraphs.join("\n\n")), words(afterParagraphs.join("\n\n")));

  // Re-group the flat word diff back into paragraphs by walking `after`'s own newlines.
  const paragraphs: DraftDiffParagraph[] = [];
  let cursor = 0;
  afterParagraphs.forEach((paragraph, index) => {
    const paragraphWordCount = words(paragraph).length;
    const consumed: T3TeamDiffSegment[] = [];
    let consumedAfterWords = 0;
    while (cursor < segments.length && consumedAfterWords < paragraphWordCount) {
      const segment = segments[cursor]!;
      consumed.push(segment);
      if (segment.kind !== "del") consumedAfterWords += 1;
      cursor += 1;
    }
    const state = consumed.every((segment) => segment.kind === "add")
      ? "add"
      : consumed.some((segment) => segment.kind)
        ? "edit"
        : undefined;
    paragraphs.push({ id: `p${index}`, segments: consumed, ...(state ? { state } : {}) });
  });

  return paragraphs;
}

export function draftDiffMagnitude(paragraphs: ReadonlyArray<DraftDiffParagraph>): DraftDiffMagnitude {
  let added = 0;
  let removed = 0;
  for (const paragraph of paragraphs) {
    for (const segment of paragraph.segments) {
      if (segment.kind === "add") added += 1;
      else if (segment.kind === "del") removed += 1;
    }
  }
  return { added, removed };
}

/**
 * The same segments with their add/del marking removed.
 *
 * For a block where EVERY token changed, word-level marking shows nothing: there is no "which words"
 * to point at, and ~20 individually padded chips are harder to read than the prose they are supposed to
 * be showing. Such a block is rendered as ordinary text with a left border in the semantic colour, and
 * the border carries "this whole block is new/gone".
 *
 * `commented` survives, because anchored feedback must stay visible however the block is drawn.
 */
export function flattenDiffSegmentKinds(
  segments: ReadonlyArray<T3TeamDiffSegment>,
): ReadonlyArray<T3TeamDiffSegment> {
  return segments.map((segment) => {
    const { kind: _dropped, ...rest } = segment;
    return rest;
  });
}

/** Whether a block changed in its entirety, and so needs no word-level marking. */
export function isWholeBlockChange(state: DraftDiffParagraph["state"]): boolean {
  return state === "add" || state === "del";
}
