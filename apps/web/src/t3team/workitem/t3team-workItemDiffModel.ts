import type { T3TeamDiffSegment } from "~/t3team/workitem/t3team-WorkItemDiffPrimitives";

/**
 * The shape a reviewed document is described in, and the one piece of real logic it needs.
 *
 * Content is data rather than markup so two things can be layered over the same text independently:
 * the diff (what the agent changed) and comments (what the reader anchored feedback to). Those
 * overlap freely — you comment on a phrase that is half inserted — and only a data model can slice
 * a run of text at both sets of boundaries without one clobbering the other.
 */

export type T3TeamDiffState = "add" | "del" | "edit";

export type T3TeamCommentedSegment = T3TeamDiffSegment & {
  readonly commented?: boolean;
};

/** Character range within a block's plain text. */
type Range = { readonly start: number; readonly end: number };

export function diffPlainText(segments: ReadonlyArray<T3TeamDiffSegment>): string {
  return segments.map((segment) => segment.text).join("");
}

function locateQuotes(plain: string, quotes: ReadonlyArray<string>): ReadonlyArray<Range> {
  const ranges: Array<Range> = [];

  for (const quote of quotes) {
    const needle = quote.trim();
    if (needle === "") continue;
    const start = plain.indexOf(needle);
    /*
      A quote that no longer appears has lost its anchor — the agent revised the sentence out from
      under it. Dropping the highlight is deliberate: the comment still shows, carrying its quote,
      rather than silently re-attaching to text the reader never selected.
    */
    if (start === -1) continue;
    ranges.push({ start, end: start + needle.length });
  }

  return ranges.sort((left, right) => left.start - right.start);
}

function isInsideAnyRange(index: number, ranges: ReadonlyArray<Range>): boolean {
  return ranges.some((range) => index >= range.start && index < range.end);
}

/**
 * Re-splits segments so every piece is uniformly inside or outside a commented range, preserving
 * each piece's original add/del mark.
 */
export function applyCommentQuotes(
  segments: ReadonlyArray<T3TeamDiffSegment>,
  quotes: ReadonlyArray<string>,
): ReadonlyArray<T3TeamCommentedSegment> {
  const ranges = locateQuotes(diffPlainText(segments), quotes);
  if (ranges.length === 0) return segments;

  const result: Array<T3TeamCommentedSegment> = [];
  let cursor = 0;

  for (const segment of segments) {
    let buffer = "";
    let bufferCommented = isInsideAnyRange(cursor, ranges);

    const flush = () => {
      if (buffer === "") return;
      result.push({
        text: buffer,
        ...(segment.kind ? { kind: segment.kind } : {}),
        ...(bufferCommented ? { commented: true } : {}),
      });
      buffer = "";
    };

    for (const character of segment.text) {
      const commented = isInsideAnyRange(cursor, ranges);
      if (commented !== bufferCommented) {
        flush();
        bufferCommented = commented;
      }
      buffer += character;
      cursor += 1;
    }

    flush();
  }

  return result;
}
