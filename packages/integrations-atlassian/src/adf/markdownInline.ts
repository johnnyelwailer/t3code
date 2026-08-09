import type { AdfNode } from "./types.ts";

function textNode(text: string, marks?: Array<Record<string, unknown>>): AdfNode {
  return marks && marks.length > 0 ? { type: "text", text, marks } : { type: "text", text };
}

/**
 * Parses a single line of inline markdown (bold/italic/code/strike/links)
 * into ADF inline nodes. Runs of plain text are accumulated into a single
 * text node instead of emitted char-by-char (fixes B4 — the old fallback
 * emitted one text node per character).
 */
export function parseInline(line: string): AdfNode[] {
  const nodes: AdfNode[] = [];
  let rest = line;
  let plainBuffer = "";

  const flushPlain = () => {
    if (plainBuffer !== "") {
      nodes.push(textNode(plainBuffer));
      plainBuffer = "";
    }
  };

  while (rest.length > 0) {
    const linkMatch = rest.match(/^\[([^\]]+)\]\(((?:[^()]|\([^()]*\))*)\)/);
    if (linkMatch) {
      flushPlain();
      if (linkMatch[1] !== "") {
        nodes.push(textNode(linkMatch[1] ?? "", [{ type: "link", attrs: { href: linkMatch[2] } }]));
      }
      rest = rest.slice(linkMatch[0].length);
      continue;
    }
    const boldMatch = rest.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      flushPlain();
      if (boldMatch[1] !== "") nodes.push(textNode(boldMatch[1] ?? "", [{ type: "strong" }]));
      rest = rest.slice(boldMatch[0].length);
      continue;
    }
    const strikeMatch = rest.match(/^~~([^~]+)~~/);
    if (strikeMatch) {
      flushPlain();
      if (strikeMatch[1] !== "") nodes.push(textNode(strikeMatch[1] ?? "", [{ type: "strike" }]));
      rest = rest.slice(strikeMatch[0].length);
      continue;
    }
    const codeMatch = rest.match(/^`([^`]+)`/);
    if (codeMatch) {
      flushPlain();
      if (codeMatch[1] !== "") nodes.push(textNode(codeMatch[1] ?? "", [{ type: "code" }]));
      rest = rest.slice(codeMatch[0].length);
      continue;
    }
    const italicMatch = rest.match(/^\*([^*]+)\*/) ?? rest.match(/^_([^_]+)_/);
    if (italicMatch) {
      flushPlain();
      if (italicMatch[1] !== "") nodes.push(textNode(italicMatch[1] ?? "", [{ type: "em" }]));
      rest = rest.slice(italicMatch[0].length);
      continue;
    }
    plainBuffer += rest[0];
    rest = rest.slice(1);
  }
  flushPlain();
  return nodes;
}
