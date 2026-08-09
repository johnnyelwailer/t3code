import type { AdfNode } from "./types.ts";
import { parseInline } from "./markdownInline.ts";

let taskListCounter = 0;

export function paragraphNode(children: AdfNode[]): AdfNode {
  return { type: "paragraph", content: children };
}

export function headingNode(level: number, children: AdfNode[]): AdfNode {
  return { type: "heading", attrs: { level: Math.min(6, Math.max(1, level)) }, content: children };
}

export function listNode(ordered: boolean, items: AdfNode[]): AdfNode {
  return { type: ordered ? "orderedList" : "bulletList", content: items };
}

export function listItemNode(children: AdfNode[]): AdfNode {
  return { type: "listItem", content: [paragraphNode(children)] };
}

export function codeBlockNode(text: string, language?: string): AdfNode {
  const node: AdfNode = { type: "codeBlock", content: text === "" ? [] : [{ type: "text", text }] };
  if (language) node.attrs = { language };
  return node;
}

export function blockquoteNode(paragraphs: AdfNode[][]): AdfNode {
  return { type: "blockquote", content: paragraphs.map((children) => paragraphNode(children)) };
}

export function taskItemNode(children: AdfNode[], done: boolean): AdfNode {
  taskListCounter += 1;
  return {
    type: "taskItem",
    attrs: { localId: `task-${taskListCounter}`, state: done ? "DONE" : "TODO" },
    content: children,
  };
}

export function taskListNode(items: AdfNode[]): AdfNode {
  taskListCounter += 1;
  return { type: "taskList", attrs: { localId: `tasklist-${taskListCounter}` }, content: items };
}

function tableCellNode(text: string, isHeader: boolean): AdfNode {
  return {
    type: isHeader ? "tableHeader" : "tableCell",
    content: [paragraphNode(parseInline(text))],
  };
}

export function tableNode(rows: string[][]): AdfNode | undefined {
  if (rows.length === 0) return undefined;
  const [head, ...body] = rows;
  return {
    type: "table",
    content: [
      { type: "tableRow", content: (head ?? []).map((c) => tableCellNode(c, true)) },
      ...body.map((row) => ({
        type: "tableRow",
        content: row.map((c) => tableCellNode(c, false)),
      })),
    ],
  };
}

export function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}
