import type { ReactNode } from "react";

import { adfTextColor } from "./t3team-adfColorTokens";
import { T3TeamAdfLink } from "./t3team-AdfLinkParts";
import type { AdfMark, AdfNode, AdfRenderContext } from "./t3team-adfRendererTypes";

function findMark(marks: readonly AdfMark[], type: string): AdfMark | undefined {
  return marks.find((mark) => mark["type"] === type);
}

function markAttrString(mark: AdfMark | undefined, key: string): string | undefined {
  const attrs = mark?.["attrs"];
  if (typeof attrs !== "object" || attrs === null) return undefined;
  const value = (attrs as Readonly<Record<string, unknown>>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Applies ADF text marks inside-out so they compose (bold + italic + link on one node).
 * `code` is innermost and `link` outermost, matching Atlassian's own renderer.
 */
export function T3TeamAdfMarkedText({
  node,
  ctx,
}: {
  readonly node: AdfNode;
  readonly ctx: AdfRenderContext;
}): ReactNode {
  const text = node.text;
  if (typeof text !== "string" || text.length === 0) return null;

  const marks = node.marks ?? [];
  if (marks.length === 0) return text;

  let content: ReactNode = text;

  if (findMark(marks, "code") !== undefined) {
    content = (
      <code className="rounded-sm border border-border/70 bg-muted/60 px-1 py-px font-mono text-xs text-foreground">
        {content}
      </code>
    );
  }

  const subsup = markAttrString(findMark(marks, "subsup"), "type");
  if (subsup === "sub") content = <sub className="text-[0.75em]">{content}</sub>;
  else if (subsup === "sup") content = <sup className="text-[0.75em]">{content}</sup>;

  if (findMark(marks, "underline") !== undefined) {
    content = <u className="underline underline-offset-2">{content}</u>;
  }
  if (findMark(marks, "strike") !== undefined) {
    content = <s className="line-through">{content}</s>;
  }
  if (findMark(marks, "em") !== undefined) {
    content = <em className="italic">{content}</em>;
  }
  if (findMark(marks, "strong") !== undefined) {
    content = <strong className="font-semibold text-foreground">{content}</strong>;
  }

  // Author background colours are deliberately not honoured as literal colours — a theme
  // pack owns the palette, and an arbitrary hex behind themed text destroys contrast.
  // The emphasis intent survives as a neutral, token-backed highlight.
  if (findMark(marks, "backgroundColor") !== undefined) {
    content = <mark className="rounded-sm bg-foreground/10 px-0.5 text-foreground">{content}</mark>;
  }

  const color = adfTextColor(markAttrString(findMark(marks, "textColor"), "color"));
  if (color !== undefined) {
    content = <span style={{ color }}>{content}</span>;
  }

  const link = findMark(marks, "link");
  if (link !== undefined) {
    content = (
      <T3TeamAdfLink
        href={markAttrString(link, "href")}
        ctx={ctx}
        title={markAttrString(link, "title")}
      >
        {content}
      </T3TeamAdfLink>
    );
  }

  return content;
}
