/**
 * Splitting a markdown document into the blocks a reviewer sees as units.
 *
 * The description writer emits MARKDOWN, and markdown says nothing about where a line ends: a paragraph is
 * routinely soft-wrapped across several lines, while a heading or a list item IS its own line. Splitting on
 * blank lines alone therefore produced blocks that a reader would never draw — a heading glued to the tail of
 * the sentence before it, a bullet list fused to the paragraph introducing it.
 *
 * The rules here are deliberately the minimum that makes the blocks honest, NOT a markdown parser:
 *
 *   - a blank line always ends a block
 *   - a heading line (`#` … `######`) is a block on its own
 *   - consecutive list items form one block, and are kept on separate lines
 *   - everything else is a paragraph, with soft line breaks joined back into running prose
 *
 * Markers (`##`, `-`) stay in the text. This is the source being reviewed, so showing it as written is
 * defensible; rendering markdown inside a diff is a separate slice.
 */

const HEADING_LINE = /^\s{0,3}#{1,6}\s/;
const LIST_ITEM_LINE = /^\s{0,3}(?:[-*+]|\d+[.)])\s/;

type BlockKind = "paragraph" | "heading" | "list";

export type T3TeamMarkdownBlock = {
  readonly kind: BlockKind;
  readonly text: string;
};

function classify(line: string): BlockKind {
  if (HEADING_LINE.test(line)) return "heading";
  if (LIST_ITEM_LINE.test(line)) return "list";
  return "paragraph";
}

/** Soft-wrapped prose rejoins with a space; list items keep their own lines. */
function joinBlock(kind: BlockKind, lines: ReadonlyArray<string>): string {
  return kind === "list" ? lines.join("\n") : lines.join(" ");
}

export function splitT3TeamMarkdownBlocks(text: string): ReadonlyArray<T3TeamMarkdownBlock> {
  const blocks: T3TeamMarkdownBlock[] = [];
  let kind: BlockKind = "paragraph";
  let lines: string[] = [];

  const flush = () => {
    if (lines.length === 0) return;
    const joined = joinBlock(kind, lines).trim();
    if (joined.length > 0) blocks.push({ kind, text: joined });
    lines = [];
  };

  for (const rawLine of text.replaceAll("\r\n", "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (line.trim().length === 0) {
      flush();
      continue;
    }

    const lineKind = classify(line);
    // A heading is always alone. Otherwise a change of kind ends the block — a list must not absorb the
    // paragraph that introduces it, and prose must not continue into a list.
    if (lineKind === "heading") {
      flush();
      blocks.push({ kind: "heading", text: line.trim() });
      kind = "paragraph";
      continue;
    }
    if (lines.length > 0 && lineKind !== kind) {
      flush();
    }
    kind = lineKind;
    lines.push(line.trim());
  }

  flush();
  return blocks;
}
