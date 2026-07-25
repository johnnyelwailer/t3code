import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/t3team/lib/t3team-utils";
import { T3TeamAdfBlockStack } from "./t3team-adfNodeRegistry";
import {
  adfAttrString,
  adfChildren,
  type AdfNodeProps,
  type AdfNodeRenderers,
} from "./t3team-adfRendererTypes";

const SUMMARY_CLASS =
  "flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden";

/**
 * Collapsible content uses native `<details>`: keyboard- and screen-reader-accessible,
 * server-renderable, and it keeps the renderer free of React state entirely.
 */
function T3TeamAdfExpandBase({
  node,
  ctx,
  depth,
  nested,
}: AdfNodeProps & { readonly nested: boolean }): ReactNode {
  const title = adfAttrString(node, "title");
  return (
    <details
      className={cn(
        "group rounded-lg border border-border/70",
        nested ? "bg-transparent" : "bg-muted/20",
      )}
      data-adf-node={nested ? "nestedExpand" : "expand"}
    >
      <summary className={cn(SUMMARY_CLASS, nested ? "px-2 py-1.5" : "px-3 py-2")}>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        {title === undefined ? null : <span className="min-w-0 truncate">{title}</span>}
      </summary>
      <T3TeamAdfBlockStack
        nodes={adfChildren(node)}
        ctx={ctx}
        depth={depth}
        className={cn("border-t border-border/60", nested ? "px-2 py-2" : "px-3 py-2.5")}
      />
    </details>
  );
}

function T3TeamAdfExpand(props: AdfNodeProps): ReactNode {
  return <T3TeamAdfExpandBase {...props} nested={false} />;
}

function T3TeamAdfNestedExpand(props: AdfNodeProps): ReactNode {
  return <T3TeamAdfExpandBase {...props} nested />;
}

export const adfExpandNodeRenderers: AdfNodeRenderers = {
  expand: T3TeamAdfExpand,
  nestedExpand: T3TeamAdfNestedExpand,
};
