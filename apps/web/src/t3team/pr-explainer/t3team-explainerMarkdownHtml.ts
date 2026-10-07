interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName: string };
}

/** Inline HTML a model may use for emphasis. Everything else is dropped, keeping its text. */
const FORMAT_TAGS: Readonly<Record<string, string>> = {
  b: "strong",
  strong: "strong",
  i: "emphasis",
  em: "emphasis",
  code: "inlineCode",
  kbd: "kbd",
  sub: "sub",
  sup: "sup",
};
/** Tags whose content is not text the reader should see. */
const SKIP_TAGS = new Set(["script", "style"]);

const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^<>]*?)?(\/?)>/g;
const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};
const decode = (text: string) =>
  text.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m]!);

type Token = { kind: "text"; value: string } | { kind: "open" | "close" | "void"; tag: string };

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of html.matchAll(TOKEN)) {
    if (match.index > last) tokens.push({ kind: "text", value: html.slice(last, match.index) });
    last = match.index + match[0].length;
    const tag = match[2]?.toLowerCase();
    if (!tag) continue;
    const kind = match[1] ? "close" : match[3] || tag === "br" ? "void" : "open";
    tokens.push({ kind, tag });
  }
  if (last < html.length) tokens.push({ kind: "text", value: html.slice(last) });
  return tokens;
}

const text = (value: string): MdNode => ({ type: "text", value });

/** A formatting element over `children`. `code` carries its text only, as inline code does. */
function wrap(tag: string, children: MdNode[]): MdNode {
  const type = FORMAT_TAGS[tag]!;
  if (type === "inlineCode") {
    return { type, value: children.map((child) => child.value ?? "").join("") };
  }
  return type === "kbd" || type === "sub" || type === "sup"
    ? { type: "explainerHtml", data: { hName: type }, children }
    : { type, children };
}

/**
 * Raw HTML in a model's markdown, as the reader should see it: a small inline subset becomes the
 * formatting it names, `<br>` a line break, and every other tag disappears while its text stays.
 * `script`/`style` lose their content too. Attributes never survive, so there are no links,
 * handlers or remote loads through HTML. Tags may arrive as separate sibling nodes (`<b>`, text,
 * `</b>`), so the open elements are tracked across a parent's children.
 */
function convert(children: MdNode[], inParagraph: boolean): MdNode[] {
  const frames: { tag: string; nodes: MdNode[] }[] = [{ tag: "", nodes: [] }];
  const push = (node: MdNode) => frames.at(-1)!.nodes.push(node);
  let skipping: string | null = null;

  for (const child of children) {
    if (child.type !== "html") {
      if (skipping) continue;
      const nested = child.children;
      if (nested && child.type !== "code") child.children = convert(nested, true);
      push(child);
      continue;
    }
    for (const token of tokenize(child.value ?? "")) {
      if (skipping) {
        if (token.kind === "close" && token.tag === skipping) skipping = null;
        continue;
      }
      if (token.kind === "text") {
        const value = decode(token.value);
        if (value.trim() || inParagraph) push(text(value));
      } else if (token.kind === "void") {
        if (token.tag === "br") push({ type: "break" });
      } else if (token.kind === "open") {
        if (SKIP_TAGS.has(token.tag)) skipping = token.tag;
        else if (token.tag in FORMAT_TAGS) frames.push({ tag: token.tag, nodes: [] });
      } else if (frames.some((frame) => frame.tag === token.tag)) {
        // Closes the nearest matching element, and any left open inside it.
        while (frames.length > 1) {
          const frame = frames.pop()!;
          push(wrap(frame.tag, frame.nodes));
          if (frame.tag === token.tag) break;
        }
      }
    }
  }
  while (frames.length > 1) {
    const frame = frames.pop()!;
    push(wrap(frame.tag, frame.nodes));
  }
  return frames[0]!.nodes;
}

/** A remark plugin: see `convert`. Block-level HTML becomes a paragraph of its text. */
export function remarkExplainerInlineHtml() {
  return (tree: MdNode) => {
    tree.children = (tree.children ?? []).flatMap((node) => {
      if (node.type !== "html") {
        if (node.children) node.children = convert(node.children, false);
        return [node];
      }
      const inline = convert([node], false);
      return inline.length > 0 ? [{ type: "paragraph", children: inline }] : [];
    });
  };
}
