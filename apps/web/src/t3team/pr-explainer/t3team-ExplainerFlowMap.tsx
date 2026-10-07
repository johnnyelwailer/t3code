import type {
  T3TeamExplainerAnchorTarget,
  T3TeamExplainerMapBlock,
  T3TeamExplainerStep,
} from "./model/t3team-explainer";
import { observeVisibleAnimation } from "./t3team-explainerHostKit";
import { useId, useMemo } from "react";

import { useExplainer } from "./t3team-explainerContext";
import { deriveExplainerMapView, explainerMapViewBox } from "./t3team-explainerMapFrame";
import { ExplainerMapEdge } from "./t3team-ExplainerMapEdge";
import { ExplainerMapNode } from "./t3team-ExplainerMapNode";

/**
 * The explainer's architecture map at one step. It is one persistent SVG: parts enter, cross out
 * and fade as the step changes, so the reader watches the before-state morph into the after.
 */
export function ExplainerFlowMap({
  step,
  stepIndex,
  block,
}: {
  step: T3TeamExplainerStep;
  stepIndex: number;
  block: T3TeamExplainerMapBlock;
}) {
  const api = useExplainer();
  const { explainer, streaming } = api;
  const titleId = useId();
  const arrowId = useId();
  const view = useMemo(
    () => deriveExplainerMapView(explainer, stepIndex, block, { streaming }),
    [block, explainer, stepIndex, streaming],
  );
  const viewBox = useMemo(() => explainerMapViewBox(explainer), [explainer]);
  if (!view) return null;
  const nodesById = new Map(view.nodes.map((entry) => [entry.node.id, entry.node]));
  const ask = (at: Element, target: T3TeamExplainerAnchorTarget, quote: string) => {
    if (api.canAsk) api.openAsk({ stepId: step.id, target, quote }, at, at);
  };

  return (
    <svg
      ref={observeVisibleAnimation}
      viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
      role="group"
      aria-labelledby={titleId}
      className="block h-auto max-h-64 w-full"
    >
      <title id={titleId}>{`Map for step ${stepIndex + 1}: ${step.caption}`}</title>
      <defs>
        <marker
          id={arrowId}
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
        </marker>
      </defs>
      {view.edges.map((edgeView) => {
        const from = nodesById.get(edgeView.edge.from);
        const to = nodesById.get(edgeView.edge.to);
        if (edgeView.phase === "hidden" || !from || !to) return null;
        return (
          // Keyed by step too: an entering part replays its entrance only on the step it enters.
          <ExplainerMapEdge
            key={`${edgeView.edge.id}:${edgeView.phase === "entering" ? step.id : ""}:${edgeView.flow ? step.id : ""}`}
            view={edgeView}
            from={from}
            to={to}
            arrowId={arrowId}
            flowEnabled={!api.reducedMotion}
            onActivate={(target) =>
              ask(
                target,
                { kind: "mapEdge", blockId: block.id, edgeId: edgeView.edge.id },
                edgeView.edge.label ?? `${from.label} → ${to.label}`,
              )
            }
          />
        );
      })}
      {view.nodes.map((nodeView) =>
        nodeView.phase === "hidden" ? null : (
          <ExplainerMapNode
            key={`${nodeView.node.id}:${nodeView.phase === "entering" ? step.id : ""}:${nodeView.focus || nodeView.warn ? step.id : ""}`}
            view={nodeView}
            onActivate={(target) =>
              ask(
                target,
                { kind: "mapNode", blockId: block.id, nodeId: nodeView.node.id },
                nodeView.node.label,
              )
            }
          />
        ),
      )}
    </svg>
  );
}
