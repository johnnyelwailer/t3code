import type { T3TeamDiffSegment } from "~/t3team/workitem/t3team-WorkItemDiffPrimitives";
import { diffWords, words } from "~/t3team/workitem/t3team-workItemDiffWords";
import { splitT3TeamMarkdownBlocks } from "~/t3team/workitem/t3team-workItemMarkdownBlocks";

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

/** Reconstructs the proposed text represented by one rendered diff block. Deleted words belong to
 * the current document and must not be sent when a reviewer accepts the proposal. */
export function draftDiffParagraphText(paragraph: DraftDiffParagraph): string {
  return paragraph.segments
    .filter((segment) => segment.kind !== "del")
    .map((segment) => segment.text)
    .join("");
}

/** Serializes the staged proposal after paragraph removals, preserving the markdown block gaps. */
export function composeDraftDescription(
  paragraphs: ReadonlyArray<DraftDiffParagraph>,
  removedParagraphIds: ReadonlySet<string> = new Set(),
): string {
  return paragraphs
    .filter((paragraph) => !removedParagraphIds.has(paragraph.id))
    .map(draftDiffParagraphText)
    .join("\n\n");
}

/**
 * Word-level diff, one block per markdown block.
 *
 * Blocks come from `splitT3TeamMarkdownBlocks`, and segments are attributed back to them BY TOKEN INDEX
 * rather than by counting words.
 *
 * The counting version drifted, cumulatively, and produced exactly the blocks PJ saw. It joined blocks with
 * `\n\n` before diffing, which became its own whitespace token in the flat list — but the per-block count it
 * walked with did not include that joiner. So every block boundary slid by one token: each block began with a
 * literal `"\n\n"` span and stole the previous block's last word ("Projektkontext. ## Rollen im", then
 * "MVP Dieses Epic umfasst"). Counting whitespace runs as words made the same accounting worse.
 *
 * Indexing is exact by construction: each `after` token knows which block it came from, so a segment that
 * exists in `after` lands in that block, and a deletion lands in the block being read when it appears.
 *
 * `before` is `undefined` for a brand-new document (a proposed comment), which reads as every block added.
 */
export function buildDraftDiffParagraphs(
  before: string | undefined,
  after: string,
): ReadonlyArray<DraftDiffParagraph> {
  const beforeBlocks = before ? splitT3TeamMarkdownBlocks(before) : [];
  const afterBlocks = splitT3TeamMarkdownBlocks(after);

  const afterTokens: string[] = [];
  const blockIndexByToken: number[] = [];
  afterBlocks.forEach((block, blockIndex) => {
    for (const token of words(block.text)) {
      afterTokens.push(token);
      blockIndexByToken.push(blockIndex);
    }
  });

  const beforeTokens = beforeBlocks.flatMap((block) => [...words(block.text)]);
  const segments = diffWords(beforeTokens, afterTokens);

  const perBlock: T3TeamDiffSegment[][] = afterBlocks.map(() => []);
  let afterCursor = 0;
  for (const segment of segments) {
    if (segment.kind === "del") {
      // A deletion has no `after` token of its own; it belongs where the reader currently is.
      const blockIndex =
        blockIndexByToken[Math.min(afterCursor, blockIndexByToken.length - 1)] ?? 0;
      perBlock[blockIndex]?.push(segment);
      continue;
    }
    const blockIndex = blockIndexByToken[afterCursor] ?? afterBlocks.length - 1;
    perBlock[blockIndex]?.push(segment);
    afterCursor += 1;
  }

  return afterBlocks.map((block, index) => {
    const consumed = perBlock[index] ?? [];
    const meaningful = consumed.filter((segment) => segment.text.trim().length > 0);
    // Whitespace-only segments must not decide a block's state — a block whose words are all new is "add"
    // even though the spaces between them were unchanged.
    const state =
      meaningful.length > 0 && meaningful.every((segment) => segment.kind === "add")
        ? "add"
        : meaningful.length > 0 && meaningful.every((segment) => segment.kind === "del")
          ? "del"
          : consumed.some((segment) => segment.kind)
            ? "edit"
            : undefined;
    return { id: `p${String(index)}`, segments: consumed, ...(state ? { state } : {}) };
  });
}

export function draftDiffMagnitude(
  paragraphs: ReadonlyArray<DraftDiffParagraph>,
): DraftDiffMagnitude {
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
