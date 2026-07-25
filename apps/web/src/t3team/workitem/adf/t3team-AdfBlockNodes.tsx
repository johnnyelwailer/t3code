import type { ReactNode } from "react";

import { cn } from "~/t3team/lib/t3team-utils";
import { T3TeamAdfBlockStack, T3TeamAdfNodes } from "./t3team-adfNodeRegistry";
import { extractAdfPlainText } from "./t3team-adfNodeText";
import {
  adfAttrNumber,
  adfChildren,
  type AdfNodeProps,
  type AdfNodeRenderers,
} from "./t3team-adfRendererTypes";

const HEADING_CLASSES: Readonly<Record<number, string>> = {
  1: "text-xl font-semibold leading-tight text-foreground",
  2: "text-lg font-semibold leading-tight text-foreground",
  3: "text-base font-semibold leading-snug text-foreground",
  4: "text-sm font-semibold leading-snug text-foreground",
  5: "text-sm font-semibold leading-snug text-foreground",
  6: "text-sm font-semibold leading-snug text-muted-foreground",
};

function headingLevel(props: AdfNodeProps): 1 | 2 | 3 | 4 | 5 | 6 {
  const level = adfAttrNumber(props.node, "level") ?? 1;
  const clamped = Math.min(6, Math.max(1, Math.round(level)));
  return clamped as 1 | 2 | 3 | 4 | 5 | 6;
}

function T3TeamAdfParagraph({ node, ctx, depth }: AdfNodeProps): ReactNode {
  const children = adfChildren(node);
  if (children.length === 0) return <p className="h-2" />;
  return (
    <p className="text-sm leading-6 text-foreground">
      <T3TeamAdfNodes nodes={children} ctx={ctx} depth={depth} />
    </p>
  );
}

function T3TeamAdfHeading(props: AdfNodeProps): ReactNode {
  const level = headingLevel(props);
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  return (
    <Tag className={cn("mt-4 first:mt-0", HEADING_CLASSES[level])}>
      <T3TeamAdfNodes nodes={adfChildren(props.node)} ctx={props.ctx} depth={props.depth} />
    </Tag>
  );
}

function T3TeamAdfBlockquote({ node, ctx, depth }: AdfNodeProps): ReactNode {
  return (
    <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
      <T3TeamAdfBlockStack nodes={adfChildren(node)} ctx={ctx} depth={depth} />
    </blockquote>
  );
}

function T3TeamAdfRule(): ReactNode {
  return <hr className="border-0 border-t border-border/70" />;
}

function T3TeamAdfCodeBlock({ node }: AdfNodeProps): ReactNode {
  // Code content is `text` children only; concatenate verbatim so indentation survives.
  const children = adfChildren(node);
  const verbatim = children.map((child) => child.text ?? "").join("");
  const code = verbatim.length > 0 ? verbatim : extractAdfPlainText(node, 20_000);
  const language =
    typeof node.attrs?.["language"] === "string" ? node.attrs["language"] : undefined;
  return (
    <pre
      className="max-w-full overflow-x-auto rounded-lg border border-border/70 bg-muted/40 p-3"
      data-adf-language={language}
    >
      <code className="font-mono text-xs leading-5 text-foreground">{code}</code>
    </pre>
  );
}

export const adfBlockNodeRenderers: AdfNodeRenderers = {
  paragraph: T3TeamAdfParagraph,
  heading: T3TeamAdfHeading,
  blockquote: T3TeamAdfBlockquote,
  rule: T3TeamAdfRule,
  codeBlock: T3TeamAdfCodeBlock,
};
