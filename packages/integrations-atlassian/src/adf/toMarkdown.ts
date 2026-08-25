/**
 * ADF -> markdown rendering, preserving structure (headings, lists, tables,
 * code blocks, panels) instead of flattening to text.
 *
 * Extracted from normalize.ts so it can be consumed without dragging that
 * module's dependencies along: normalize.ts imports `effect/DateTime` plus two
 * `workspace:*` packages, and this package's deps use pnpm-only `workspace:`
 * and `catalog:` protocols, so nothing outside the pnpm workspace can resolve
 * it. This module deliberately imports NOTHING — that is what lets the
 * knowledge index (installed with npm, from a different repository) reuse the
 * renderer instead of growing a second copy that drifts.
 *
 * Same intent as the `extractTextFromADF` delegation in normalize.ts: keep
 * exactly one implementation.
 *
 * The types are declared here rather than imported from ./types.ts because the
 * renderer wants the readonly, everything-optional shape that tolerates
 * arbitrary API payloads; ./types.ts models an ADF document being *built*,
 * where `type` is required.
 */

export type AdfMarkLike = {
  readonly type?: string;
  readonly attrs?: Record<string, unknown>;
};

export type AdfNodeLike = {
  readonly type?: string;
  readonly text?: string;
  readonly attrs?: Record<string, unknown>;
  readonly marks?: ReadonlyArray<AdfMarkLike>;
  readonly content?: ReadonlyArray<AdfNodeLike>;
};

function applyMarkdownMarks(text: string, marks: ReadonlyArray<AdfMarkLike> | undefined): string {
  if (!marks || marks.length === 0 || text.length === 0) return text;

  return marks.reduce((current, mark) => {
    switch (mark.type) {
      case "strong":
        return `**${current}**`;
      case "em":
        return `*${current}*`;
      case "strike":
        return `~~${current}~~`;
      case "code":
        return `\`${current}\``;
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
        return href ? `[${current}](${href})` : current;
      }
      default:
        return current;
    }
  }, text);
}

function stringifyAdfInline(node: AdfNodeLike): string {
  if (node.type === "text") {
    return applyMarkdownMarks(node.text ?? "", node.marks);
  }

  if (node.type === "hardBreak") {
    return "\\n";
  }

  if (node.type === "emoji") {
    return typeof node.attrs?.text === "string" ? node.attrs.text : "";
  }

  if (node.type === "inlineCard" || node.type === "mention") {
    const label =
      typeof node.attrs?.text === "string"
        ? node.attrs.text
        : typeof node.attrs?.title === "string"
          ? node.attrs.title
          : "link";
    const href = typeof node.attrs?.url === "string" ? node.attrs.url : "";
    return href ? `[${label}](${href})` : label;
  }

  const children = Array.isArray(node.content)
    ? node.content.map((child) => stringifyAdfInline(child)).join("")
    : "";
  return applyMarkdownMarks(children, node.marks);
}

function stringifyAdfList(
  nodes: ReadonlyArray<AdfNodeLike> | undefined,
  depth: number,
  ordered: boolean,
): string {
  if (!nodes || nodes.length === 0) return "";
  const prefixBase = "  ".repeat(Math.max(0, depth));

  return nodes
    .map((item, index) => {
      if (item.type !== "listItem") {
        return stringifyAdfBlock(item, depth + 1);
      }

      const marker = ordered ? `${index + 1}. ` : "- ";
      const children = item.content ?? [];
      const renderedChildren = children
        .map((child) => stringifyAdfBlock(child, depth + 1))
        .filter((value) => value.length > 0);

      if (renderedChildren.length === 0) {
        return `${prefixBase}${marker}`;
      }

      const [first = "", ...rest] = renderedChildren;
      const firstLine = first.replace(/^\s+/, "");
      const restText = rest
        .map((entry) =>
          entry
            .split("\n")
            .map((line) => (line.length > 0 ? `${prefixBase}  ${line}` : ""))
            .join("\n"),
        )
        .join("\n");

      return [`${prefixBase}${marker}${firstLine}`, restText]
        .filter((segment) => segment.length > 0)
        .join("\n");
    })
    .join("\n");
}

function stringifyAdfBlock(node: AdfNodeLike, depth = 0): string {
  switch (node.type) {
    case "paragraph":
      return (node.content ?? [])
        .map((child) => stringifyAdfInline(child))
        .join("")
        .trimEnd();
    case "heading": {
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 2;
      const safeLevel = Math.min(Math.max(level, 1), 6);
      return `${"#".repeat(safeLevel)} ${(node.content ?? [])
        .map((child) => stringifyAdfInline(child))
        .join("")}`.trimEnd();
    }
    case "bulletList":
      return stringifyAdfList(node.content, depth, false);
    case "orderedList":
      return stringifyAdfList(node.content, depth, true);
    case "blockquote": {
      const raw = (node.content ?? []).map((child) => stringifyAdfBlock(child, depth)).join("\n");
      return raw
        .split("\n")
        .map((line) => (line.length > 0 ? `> ${line}` : ">"))
        .join("\n");
    }
    case "rule":
      return "---";
    case "codeBlock": {
      const code = (node.content ?? []).map((child) => child.text ?? "").join("");
      const language = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      return `\`\`\`${language}\n${code}\n\`\`\``;
    }
    case "panel": {
      const panelType = typeof node.attrs?.panelType === "string" ? node.attrs.panelType : "info";
      const body = (node.content ?? [])
        .map((child) => stringifyAdfBlock(child, depth))
        .join("\n\n");
      return `> [!${panelType.toUpperCase()}]\n> ${body.replace(/\n/g, "\n> ")}`;
    }
    default:
      return stringifyAdfInline(node).trimEnd();
  }
}

/**
 * Renders an ADF document to markdown. Returns `""` for a non-document input,
 * so callers that need a guaranteed-non-empty string should fall back to a
 * plain-text extraction (`extractAdfText`) on an empty result — the pattern
 * normalize.ts uses at each of its call sites.
 */
export function convertAdfToMarkdown(document: unknown): string {
  if (!document || typeof document !== "object") return "";
  const root = document as AdfNodeLike;
  const content = Array.isArray(root.content) ? root.content : [];

  return content
    .map((node) => stringifyAdfBlock(node))
    .filter((line) => line.length > 0)
    .join("\n\n")
    .trim();
}
