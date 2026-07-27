import type { ReactNode } from "react";

import { T3TeamAdfNodes } from "./t3team-adfNodeRegistry";
import { extractAdfPlainText } from "./t3team-adfNodeText";
import { adfChildren, type AdfNode, type AdfNodeProps } from "./t3team-adfRendererTypes";

/**
 * Depth-limit and leaf fallback: renders the node's readable text and nothing else.
 * Never recurses through components, never renders raw JSON, never throws.
 */
export function T3TeamAdfFlattenedNode({ node }: { readonly node: AdfNode }): ReactNode {
  const text = extractAdfPlainText(node);
  if (text.length === 0) return null;
  return (
    <span className="whitespace-pre-line" data-adf-flattened={node.type}>
      {text}
    </span>
  );
}

/**
 * Fallback for node types this renderer does not model (extensions, sync blocks, future
 * additions). A container still shows its children — nothing is silently dropped and the
 * user is never shown a placeholder banner about it.
 */
export function T3TeamAdfUnknownNode({ node, ctx, depth }: AdfNodeProps): ReactNode {
  const children = adfChildren(node);
  if (children.length > 0) {
    return <T3TeamAdfNodes nodes={children} ctx={ctx} depth={depth} />;
  }
  return <T3TeamAdfFlattenedNode node={node} />;
}
