import type { T3TeamPrExplainer } from "@t3tools/contracts";
import { useId, useMemo } from "react";

import { observeVisibleAnimation } from "~/lib/visibleAnimation";

import { usePrExplainerAsk } from "./t3team-prExplainerAskContext";
import { derivePrExplainerMapFrame, prExplainerMapViewBox } from "./t3team-prExplainerMapFrame";
import { PrExplainerMapEdgeShape, PrExplainerMapNodeShape } from "./t3team-PrExplainerMapParts";

/**
 * The explainer's architecture map at one step. It is one persistent SVG: parts enter, cross out
 * and fade as the step changes, so the reader watches the before-state morph into the after.
 */
export function PrExplainerFlowMap({
  explainer,
  stepIndex,
  reducedMotion,
}: {
  explainer: T3TeamPrExplainer;
  stepIndex: number;
  reducedMotion: boolean;
}) {
  const ask = usePrExplainerAsk();
  const titleId = useId();
  const arrowId = useId();
  const frame = useMemo(
    () => derivePrExplainerMapFrame(explainer, stepIndex),
    [explainer, stepIndex],
  );
  const viewBox = useMemo(() => prExplainerMapViewBox(explainer), [explainer]);
  const step = explainer.steps[stepIndex];
  if (!frame || !step) return null;
  const nodesById = new Map(frame.nodes.map((entry) => [entry.node.id, entry.node]));
  const canAsk = ask.canAsk;

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
      {frame.edges.map((edgeFrame) => {
        const from = nodesById.get(edgeFrame.edge.from);
        const to = nodesById.get(edgeFrame.edge.to);
        if (edgeFrame.phase === "hidden" || !from || !to) return null;
        return (
          // Keyed by step too: an entering part replays its entrance only on the step it enters.
          <PrExplainerMapEdgeShape
            key={`${edgeFrame.edge.id}:${edgeFrame.phase === "entering" ? step.id : ""}:${edgeFrame.flow ? step.id : ""}`}
            frame={edgeFrame}
            from={from}
            to={to}
            arrowId={arrowId}
            flowEnabled={!reducedMotion}
            onActivate={(target) =>
              canAsk &&
              ask.openAsk(
                {
                  stepId: step.id,
                  target: { kind: "mapEdge", edgeId: edgeFrame.edge.id },
                  quote: edgeFrame.edge.label ?? `${from.label} → ${to.label}`,
                },
                target,
              )
            }
          />
        );
      })}
      {frame.nodes.map((nodeFrame) =>
        nodeFrame.phase === "hidden" ? null : (
          <PrExplainerMapNodeShape
            key={`${nodeFrame.node.id}:${nodeFrame.phase === "entering" ? step.id : ""}:${nodeFrame.focus || nodeFrame.warn ? step.id : ""}`}
            frame={nodeFrame}
            onActivate={(target) =>
              canAsk &&
              ask.openAsk(
                {
                  stepId: step.id,
                  target: { kind: "mapNode", nodeId: nodeFrame.node.id },
                  quote: nodeFrame.node.label,
                },
                target,
              )
            }
          />
        ),
      )}
    </svg>
  );
}
