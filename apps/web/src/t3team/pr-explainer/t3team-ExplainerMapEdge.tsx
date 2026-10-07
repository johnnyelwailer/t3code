import type { T3TeamExplainerMapNode } from "./model/t3team-explainer";
import { cn } from "./t3team-explainerHostKit";
import { explainerMapActivation, type ExplainerMapActivate } from "./t3team-explainerMapActivation";
import { explainerEdgePath, type ExplainerEdgeView } from "./t3team-explainerMapFrame";

export function ExplainerMapEdge({
  view,
  from,
  to,
  arrowId,
  flowEnabled,
  onActivate,
}: {
  view: ExplainerEdgeView;
  arrowId: string;
  from: T3TeamExplainerMapNode;
  to: T3TeamExplainerMapNode;
  flowEnabled: boolean;
  onActivate: ExplainerMapActivate;
}) {
  const { edge, phase, focus, flow } = view;
  const { d, mid, horizontal } = explainerEdgePath(from, to);
  const removed = phase === "removing" || phase === "gone";
  const active = focus || flow;
  return (
    <g
      {...explainerMapActivation(onActivate)}
      aria-label={`${from.label} to ${to.label}${edge.label ? `: ${edge.label}` : ""}${removed ? " (removed)" : ""}. Ask about it.`}
      className={cn(
        "group/edge cursor-pointer outline-none t3team-xp-fade",
        phase === "entering" && "t3team-xp-enter",
        phase === "gone" && "opacity-25",
      )}
    >
      <title>{edge.label ?? `${from.label} → ${to.label}`}</title>
      {/* A wide clear stroke so a thin edge is easy to point at. */}
      <path d={d} fill="none" strokeWidth={12} className="stroke-transparent" />
      <path
        d={d}
        fill="none"
        markerEnd={`url(#${arrowId})`}
        strokeWidth={active ? 1.75 : 1.25}
        className={cn(
          "stroke-muted-foreground/50 group-hover/edge:stroke-foreground/60 group-focus-visible/edge:stroke-ring",
          (edge.style === "async" || removed) && "[stroke-dasharray:5_4]",
          active && "stroke-primary",
          phase === "entering" && "stroke-success",
          removed && "stroke-diff-deletion-foreground/70",
        )}
      />
      {flow && flowEnabled && !removed ? (
        <path d={d} fill="none" className="t3team-xp-flow pointer-events-none stroke-primary" />
      ) : null}
      {removed ? (
        <g className="stroke-diff-deletion-foreground" strokeWidth={2} strokeLinecap="round">
          <line x1={mid.x - 5} y1={mid.y - 5} x2={mid.x + 5} y2={mid.y + 5} />
          <line x1={mid.x + 5} y1={mid.y - 5} x2={mid.x - 5} y2={mid.y + 5} />
        </g>
      ) : edge.label ? (
        <text
          x={horizontal ? mid.x : mid.x + 6}
          y={horizontal ? mid.y - 5 : mid.y + 3}
          textAnchor={horizontal ? "middle" : "start"}
          className="fill-muted-foreground text-3xs [paint-order:stroke] stroke-background [stroke-width:3px]"
        >
          {edge.label}
        </text>
      ) : null}
    </g>
  );
}
