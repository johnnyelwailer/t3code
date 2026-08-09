import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/t3team/lib/t3team-utils";
import { T3TeamAdfNodes } from "./t3team-adfNodeRegistry";
import {
  adfAttrNumber,
  adfAttrString,
  adfChildren,
  type AdfNodeProps,
  type AdfNodeRenderers,
} from "./t3team-adfRendererTypes";

const LIST_CLASS = "ml-5 space-y-1";
const LIST_ITEM_CLASS = "text-sm leading-6 text-foreground marker:text-muted-foreground";

function T3TeamAdfBulletList({ node, ctx, depth }: AdfNodeProps): ReactNode {
  return (
    <ul className={cn(LIST_CLASS, "list-disc [&_ul]:list-[circle] [&_ul_ul]:list-[square]")}>
      <T3TeamAdfNodes nodes={adfChildren(node)} ctx={ctx} depth={depth} />
    </ul>
  );
}

function T3TeamAdfOrderedList({ node, ctx, depth }: AdfNodeProps): ReactNode {
  const order = adfAttrNumber(node, "order");
  return (
    <ol
      className={cn(
        LIST_CLASS,
        "list-decimal [&_ol]:list-[lower-alpha] [&_ol_ol]:list-[lower-roman]",
      )}
      start={order !== undefined && order >= 0 ? Math.round(order) : undefined}
    >
      <T3TeamAdfNodes nodes={adfChildren(node)} ctx={ctx} depth={depth} />
    </ol>
  );
}

function T3TeamAdfListItem({ node, ctx, depth }: AdfNodeProps): ReactNode {
  return (
    <li className={cn(LIST_ITEM_CLASS, "[&>*+*]:mt-2")}>
      <T3TeamAdfNodes nodes={adfChildren(node)} ctx={ctx} depth={depth} />
    </li>
  );
}

function T3TeamAdfTaskList({ node, ctx, depth }: AdfNodeProps): ReactNode {
  return (
    <ul className="ml-0 list-none space-y-1.5" data-adf-node="taskList">
      <T3TeamAdfNodes nodes={adfChildren(node)} ctx={ctx} depth={depth} />
    </ul>
  );
}

function T3TeamAdfTaskItem({ node, ctx, depth }: AdfNodeProps): ReactNode {
  const done = adfAttrString(node, "state")?.toUpperCase() === "DONE";
  return (
    <li
      className="flex items-start gap-2"
      data-adf-node="taskItem"
      data-adf-state={done ? "DONE" : "TODO"}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-1.5 flex size-3.5 shrink-0 items-center justify-center rounded-sm border",
          done ? "border-success/40 bg-success/12" : "border-border bg-background",
        )}
      >
        {done ? <Check className="size-3 text-success-foreground" /> : null}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 text-sm leading-6",
          done ? "text-muted-foreground line-through" : "text-foreground",
        )}
      >
        <T3TeamAdfNodes nodes={adfChildren(node)} ctx={ctx} depth={depth} />
      </span>
    </li>
  );
}

export const adfListNodeRenderers: AdfNodeRenderers = {
  bulletList: T3TeamAdfBulletList,
  orderedList: T3TeamAdfOrderedList,
  listItem: T3TeamAdfListItem,
  taskList: T3TeamAdfTaskList,
  taskItem: T3TeamAdfTaskItem,
  // `blockTaskItem` is the block-content variant of taskItem and renders identically.
  blockTaskItem: T3TeamAdfTaskItem,
};
