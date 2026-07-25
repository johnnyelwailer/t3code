import type { AdfNode } from "./types.ts";
import { parseInline } from "./markdownInline.ts";
import {
  blockquoteNode,
  codeBlockNode,
  headingNode,
  listItemNode,
  listNode,
  paragraphNode,
  splitTableRow,
  taskItemNode,
  taskListNode,
  tableNode,
} from "./markdownAdfNodes.ts";

/**
 * Converts a markdown string into an ADF document. Supports paragraphs,
 * headings (h1-h6), bullet/ordered lists, task items (`- [ ]`/`- [x]`),
 * fenced code blocks with language, blockquotes, tables (with header row),
 * rule, and inline bold/italic/code/strike/links.
 */
export function markdownToAdf(markdown: string): AdfNode {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const content: AdfNode[] = [];
  let paragraph: string[] = [];
  let codeLines: string[] = [];
  let codeLanguage: string | undefined;
  let inCodeBlock = false;
  let quoteLines: string[] = [];
  let tableRows: string[][] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      const children = paragraph.flatMap((line) => parseInline(line));
      if (children.length > 0) content.push(paragraphNode(children));
      paragraph = [];
    }
  };
  const flushCodeBlock = () => {
    if (codeLines.length || codeLanguage !== undefined) {
      content.push(codeBlockNode(codeLines.join("\n"), codeLanguage));
      codeLines = [];
      codeLanguage = undefined;
    }
  };
  const flushQuote = () => {
    if (quoteLines.length) {
      content.push(blockquoteNode(quoteLines.filter((l) => l !== "").map((l) => parseInline(l))));
      quoteLines = [];
    }
  };
  const flushTable = () => {
    const node = tableNode(tableRows);
    if (node) content.push(node);
    tableRows = [];
  };

  const bulletItems: AdfNode[] = [];
  const orderedItems: AdfNode[] = [];
  const taskItems: AdfNode[] = [];
  const flushLists = () => {
    if (bulletItems.length) content.push(listNode(false, bulletItems.splice(0, bulletItems.length)));
    if (orderedItems.length) content.push(listNode(true, orderedItems.splice(0, orderedItems.length)));
    if (taskItems.length) content.push(taskListNode(taskItems.splice(0, taskItems.length)));
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushParagraph();
      flushLists();
      flushQuote();
      flushTable();
      continue;
    }
    if (line.startsWith("```")) {
      flushParagraph();
      flushLists();
      flushQuote();
      flushTable();
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        const lang = line.slice(3).trim();
        codeLanguage = lang !== "" ? lang : undefined;
      }
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }
    if (line.trim().startsWith("|") && line.includes("|")) {
      flushParagraph();
      flushLists();
      flushQuote();
      const trimmed = line.trim();
      if (/^\|?[\s:|-]+\|?$/.test(trimmed)) continue; // separator row
      tableRows.push(splitTableRow(trimmed));
      continue;
    }
    flushTable();
    if (/^>\s?/.test(line)) {
      flushParagraph();
      flushLists();
      quoteLines.push(line.replace(/^>\s?/, ""));
      continue;
    }
    flushQuote();
    if (/^#{1,6}\s+/.test(line)) {
      flushParagraph();
      flushLists();
      const level = line.match(/^(#{1,6})/)?.[1]?.length ?? 1;
      const text = line.replace(/^#{1,6}\s+/, "");
      content.push(headingNode(level, parseInline(text)));
      continue;
    }
    const taskMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      flushParagraph();
      taskItems.push(taskItemNode(parseInline(taskMatch[2] ?? ""), taskMatch[1]?.toLowerCase() === "x"));
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      bulletItems.push(listItemNode(parseInline(line.replace(/^[-*]\s+/, ""))));
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      flushParagraph();
      orderedItems.push(listItemNode(parseInline(line.replace(/^\d+\.\s+/, ""))));
      continue;
    }
    if (line.trim() === "---") {
      flushParagraph();
      flushLists();
      content.push({ type: "rule" });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  flushLists();
  flushQuote();
  flushTable();
  flushCodeBlock();
  return { type: "doc", version: 1, content } as AdfNode & { version: number };
}
