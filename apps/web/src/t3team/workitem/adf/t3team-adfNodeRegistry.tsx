import type { ReactNode } from "react";

import { cn } from "~/t3team/lib/t3team-utils";
import { adfBlockNodeRenderers } from "./t3team-AdfBlockNodes";
import { adfExpandNodeRenderers } from "./t3team-AdfExpandNodes";
import { adfInlineNodeRenderers } from "./t3team-AdfInlineNodes";
import { adfListNodeRenderers } from "./t3team-AdfListNodes";
import { adfMediaNodeRenderers } from "./t3team-AdfMediaNodes";
import { adfPanelNodeRenderers } from "./t3team-AdfPanelNodes";
import { adfTableNodeRenderers } from "./t3team-AdfTableNodes";
import { T3TeamAdfFlattenedNode, T3TeamAdfUnknownNode } from "./t3team-AdfUnknownNode";
import {
  ADF_MAX_RENDER_DEPTH,
  type AdfNode,
  type AdfNodeProps,
  type AdfNodeRenderers,
  type AdfRenderContext,
} from "./t3team-adfRendererTypes";

/** Single dispatch table: ADF node type -> component. No switch statements anywhere else. */
const ADF_NODE_RENDERERS: AdfNodeRenderers = {
  ...adfBlockNodeRenderers,
  ...adfListNodeRenderers,
  ...adfTableNodeRenderers,
  ...adfInlineNodeRenderers,
  ...adfMediaNodeRenderers,
  ...adfPanelNodeRenderers,
  ...adfExpandNodeRenderers,
};

export function listAdfRenderedNodeTypes(): readonly string[] {
  return Object.keys(ADF_NODE_RENDERERS).sort();
}

/** Vertical rhythm for block content, shared by every block container. */
export const ADF_BLOCK_STACK_CLASS = "space-y-3";

export function T3TeamAdfNode({ node, ctx, depth }: AdfNodeProps): ReactNode {
  if (depth > ADF_MAX_RENDER_DEPTH) {
    return <T3TeamAdfFlattenedNode node={node} />;
  }
  const Renderer = ADF_NODE_RENDERERS[node.type] ?? T3TeamAdfUnknownNode;
  return <Renderer node={node} ctx={ctx} depth={depth} />;
}

/** Renders a node list one level deeper than `depth`. */
export function T3TeamAdfNodes({
  nodes,
  ctx,
  depth,
}: {
  readonly nodes: readonly AdfNode[];
  readonly ctx: AdfRenderContext;
  readonly depth: number;
}): ReactNode {
  return nodes.map((node, index) => (
    <T3TeamAdfNode key={index} node={node} ctx={ctx} depth={depth + 1} />
  ));
}

/** Block children wrapped in the shared vertical rhythm. */
export function T3TeamAdfBlockStack({
  nodes,
  ctx,
  depth,
  className,
}: {
  readonly nodes: readonly AdfNode[];
  readonly ctx: AdfRenderContext;
  readonly depth: number;
  readonly className?: string;
}): ReactNode {
  if (nodes.length === 0) return null;
  return (
    <div className={cn(ADF_BLOCK_STACK_CLASS, className)}>
      <T3TeamAdfNodes nodes={nodes} ctx={ctx} depth={depth} />
    </div>
  );
}
