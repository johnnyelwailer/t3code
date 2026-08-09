import { CircleAlert, CircleCheck, Info, Lightbulb, TriangleAlert } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { cn } from "~/t3team/lib/t3team-utils";
import {
  ADF_TONE_ACCENT_CLASSES,
  ADF_TONE_SURFACE_CLASSES,
  adfPanelTone,
  type AdfTone,
} from "./t3team-adfColorTokens";
import { T3TeamAdfCardChip } from "./t3team-AdfLinkParts";
import { T3TeamAdfBlockStack, T3TeamAdfNodes } from "./t3team-adfNodeRegistry";
import {
  adfAttrString,
  adfChildren,
  type AdfNodeProps,
  type AdfNodeRenderers,
} from "./t3team-adfRendererTypes";

const PANEL_ICONS: Readonly<Record<AdfTone, ComponentType<{ className?: string }>>> = {
  info: Info,
  primary: Lightbulb,
  warning: TriangleAlert,
  danger: CircleAlert,
  success: CircleCheck,
  muted: Info,
};

function T3TeamAdfPanel({ node, ctx, depth }: AdfNodeProps): ReactNode {
  const tone = adfPanelTone(adfAttrString(node, "panelType"));
  const Icon = PANEL_ICONS[tone];
  return (
    <div
      className={cn("flex gap-2.5 rounded-lg border p-3", ADF_TONE_SURFACE_CLASSES[tone])}
      data-adf-node="panel"
      data-adf-panel-tone={tone}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", ADF_TONE_ACCENT_CLASSES[tone])} />
      <T3TeamAdfBlockStack
        nodes={adfChildren(node)}
        ctx={ctx}
        depth={depth}
        className="min-w-0 flex-1"
      />
    </div>
  );
}

function T3TeamAdfDecisionList({ node, ctx, depth }: AdfNodeProps): ReactNode {
  return (
    <ul className="space-y-1.5" data-adf-node="decisionList">
      <T3TeamAdfNodes nodes={adfChildren(node)} ctx={ctx} depth={depth} />
    </ul>
  );
}

function T3TeamAdfDecisionItem({ node, ctx, depth }: AdfNodeProps): ReactNode {
  return (
    <li
      className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/25 px-2.5 py-1.5"
      data-adf-node="decisionItem"
    >
      <CircleCheck className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-sm leading-6 text-foreground">
        <T3TeamAdfNodes nodes={adfChildren(node)} ctx={ctx} depth={depth} />
      </span>
    </li>
  );
}

/**
 * `blockCard` / `embedCard` are smart links. We render a link chip rather than an embedded
 * frame: no third-party document is loaded into the app, and a Jira target still routes
 * through `onOpenIssue`.
 */
function T3TeamAdfBlockCard({ node, ctx }: AdfNodeProps): ReactNode {
  return <T3TeamAdfCardChip url={adfAttrString(node, "url")} ctx={ctx} block />;
}

export const adfPanelNodeRenderers: AdfNodeRenderers = {
  panel: T3TeamAdfPanel,
  decisionList: T3TeamAdfDecisionList,
  decisionItem: T3TeamAdfDecisionItem,
  blockCard: T3TeamAdfBlockCard,
  embedCard: T3TeamAdfBlockCard,
};
