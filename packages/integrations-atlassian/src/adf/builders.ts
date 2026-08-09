export type { AdfNode, PanelType, StatusColor, TaskState } from "./types.ts";
export { text as textWithMarks, type MarkSpec } from "./marks.ts";
export { table, type CellSpec } from "./table.ts";
export {
  status,
  taskItem,
  taskList,
  inlineCard,
  date,
  mention,
  codeBlock,
  panel,
  expand,
  nestedExpand,
  rule,
} from "./nodes.ts";

import type { AdfNode } from "./types.ts";

/** A heading node at the given level (1-6, clamped), with plain-text content. Empty text yields no content children. */
export function heading(level: number, text: string): AdfNode {
  return {
    type: "heading",
    attrs: { level: Math.min(6, Math.max(1, level)) },
    content: text === "" ? [] : [{ type: "text", text }],
  };
}

/** A paragraph node with plain-text content. Empty text yields an empty (still-valid) paragraph. */
export function paragraph(text: string): AdfNode {
  return { type: "paragraph", content: text === "" ? [] : [{ type: "text", text }] };
}

/** A bullet list from plain-text items. Empty-string items are skipped (never emit empty text nodes). */
export function bulletList(items: string[]): AdfNode {
  return {
    type: "bulletList",
    content: items
      .filter((item) => item !== "")
      .map((item) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: item }] }],
      })),
  };
}

/** A text link node, usable inside paragraph content arrays. Throws on empty text (would emit an invalid text node). */
export function link(text: string, href: string): AdfNode {
  if (text === "") {
    throw new TypeError("link() requires non-empty text");
  }
  return { type: "text", text, marks: [{ type: "link", attrs: { href } }] };
}

/** Assembles top-level ADF blocks into a full ADF document (version: 1, required by the Jira API). */
export function docFromBlocks(blocks: AdfNode[]): AdfNode {
  return { type: "doc", version: 1, content: blocks } as AdfNode & { version: number };
}
