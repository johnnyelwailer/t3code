import type { T3TeamExplainerDiffBlock, T3TeamExplainerDiffLine } from "./model/t3team-explainer";

/** A diff line with the numbers the model did not have to write. */
export interface ExplainerNumberedLine {
  readonly line: T3TeamExplainerDiffLine;
  readonly oldLine: number | null;
  readonly newLine: number | null;
}

/**
 * Every line a diff block can show (`before` + `lines` + `after`), numbered from its start lines
 * and line kinds. `focusStart`/`focusEnd` bound the slice itself, end-exclusive.
 */
export function numberExplainerDiff(block: T3TeamExplainerDiffBlock) {
  const before = block.before ?? [];
  let oldLine = block.oldStart ?? block.newStart;
  let newLine = block.newStart;
  const all: ExplainerNumberedLine[] = [...before, ...block.lines, ...(block.after ?? [])].map(
    (line) => {
      const numbered = {
        line,
        oldLine: line.kind === "add" ? null : oldLine,
        newLine: line.kind === "delete" ? null : newLine,
      };
      if (line.kind !== "add") oldLine += 1;
      if (line.kind !== "delete") newLine += 1;
      return numbered;
    },
  );
  return { all, focusStart: before.length, focusEnd: before.length + block.lines.length };
}

/** `@@ -old,count +new,count @@` for the given lines, as a diff header names them. */
export function explainerHunkHeader(lines: ReadonlyArray<ExplainerNumberedLine>) {
  const olds = lines.flatMap((entry) => (entry.oldLine === null ? [] : [entry.oldLine]));
  const news = lines.flatMap((entry) => (entry.newLine === null ? [] : [entry.newLine]));
  return `@@ -${olds[0] ?? 0},${olds.length} +${news[0] ?? 0},${news.length} @@`;
}

/** The file's change count when the model gave it, else the slice's own. */
export function explainerDiffStats(block: T3TeamExplainerDiffBlock) {
  if (block.stats) return block.stats;
  return {
    additions: block.lines.filter((line) => line.kind === "add").length,
    deletions: block.lines.filter((line) => line.kind === "delete").length,
  };
}

export interface ExplainerTextSegment {
  readonly text: string;
  readonly mark: boolean;
}

/**
 * Splits `text` around every occurrence of the given substrings. Overlaps resolve to the first
 * match, the longer one on a tie; a substring that is not there is ignored.
 */
export function explainerHighlightSegments(
  text: string,
  words: ReadonlyArray<string> | undefined,
): ReadonlyArray<ExplainerTextSegment> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const word of words ?? []) {
    if (word.length === 0) continue;
    for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + word.length)) {
      ranges.push({ start: at, end: at + word.length });
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const segments: ExplainerTextSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) segments.push({ text: text.slice(cursor, range.start), mark: false });
    segments.push({ text: text.slice(range.start, range.end), mark: true });
    cursor = range.end;
  }
  if (cursor < text.length || segments.length === 0) {
    segments.push({ text: text.slice(cursor), mark: false });
  }
  return segments;
}
