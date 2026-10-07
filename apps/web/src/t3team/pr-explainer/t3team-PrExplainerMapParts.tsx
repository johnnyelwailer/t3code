import type { T3TeamPrExplainerMapNode } from "@t3tools/contracts";
import type { KeyboardEvent, MouseEvent, SVGProps } from "react";

import { cn } from "~/lib/utils";

import {
  prExplainerEdgePath,
  prExplainerNodeBox,
  type PrExplainerEdgeFrame,
  type PrExplainerNodeFrame,
} from "./t3team-prExplainerMapFrame";

const ROLE_TONE: Record<T3TeamPrExplainerMapNode["role"], string> = {
  ui: "fill-info",
  service: "fill-primary",
  store: "fill-success",
  external: "fill-muted-foreground",
  test: "fill-success",
};

type Activate = (target: Element) => void;

function activation(onActivate: Activate) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: (event: MouseEvent<SVGGElement>) => onActivate(event.currentTarget),
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onActivate(event.currentTarget);
    },
  } satisfies SVGProps<SVGGElement>;
}

const PHASE_WORD = {
  entering: "new",
  removing: "removed",
  gone: "removed",
  present: "",
  hidden: "",
};

export function PrExplainerMapNodeShape({
  frame,
  onActivate,
}: {
  frame: PrExplainerNodeFrame;
  onActivate: Activate;
}) {
  const { node, phase, focus, warn } = frame;
  const box = prExplainerNodeBox(node);
  const status = [PHASE_WORD[phase], warn ? "needs a check" : focus ? "in this step" : ""]
    .filter(Boolean)
    .join(", ");
  return (
    <g
      {...activation(onActivate)}
      aria-label={`${node.label}${status ? ` (${status})` : ""}. Ask about it.`}
      className={cn(
        "group/node cursor-pointer outline-none t3team-pxp-fade",
        phase === "entering" && "t3team-pxp-enter",
        phase === "gone" && "opacity-30",
        phase === "removing" && "opacity-60",
      )}
    >
      <title>{node.label}</title>
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={8}
        strokeWidth={focus || warn ? 2 : 1}
        className={cn(
          "fill-card stroke-border group-focus-visible/node:stroke-ring group-hover/node:stroke-foreground/40",
          node.role === "external" && "[stroke-dasharray:4_3]",
          phase === "entering" && "stroke-success",
          focus && "stroke-primary t3team-pxp-pulse",
          warn && "fill-warning/12 stroke-warning t3team-pxp-pulse",
        )}
      />
      <rect
        x={box.x + 6}
        y={box.y + 10}
        width={3}
        height={box.height - 20}
        rx={1.5}
        className={cn(ROLE_TONE[node.role], warn && "fill-warning")}
      />
      <text
        x={box.x + 16}
        y={box.y + (node.sublabel ? 17 : 24)}
        className="fill-foreground text-2xs font-medium"
      >
        {node.label}
      </text>
      {node.sublabel ? (
        <text x={box.x + 16} y={box.y + 30} className="fill-muted-foreground text-3xs">
          {node.sublabel}
        </text>
      ) : null}
      {phase === "removing" || phase === "gone" ? (
        <line
          x1={box.x + 8}
          y1={box.y + box.height / 2}
          x2={box.x + box.width - 8}
          y2={box.y + box.height / 2}
          strokeWidth={1.5}
          className="stroke-diff-deletion-foreground"
        />
      ) : null}
    </g>
  );
}

export function PrExplainerMapEdgeShape({
  frame,
  from,
  to,
  arrowId,
  flowEnabled,
  onActivate,
}: {
  frame: PrExplainerEdgeFrame;
  arrowId: string;
  from: T3TeamPrExplainerMapNode;
  to: T3TeamPrExplainerMapNode;
  flowEnabled: boolean;
  onActivate: Activate;
}) {
  const { edge, phase, focus, flow } = frame;
  const { d, mid, horizontal } = prExplainerEdgePath(from, to);
  const removed = phase === "removing" || phase === "gone";
  const active = focus || flow;
  return (
    <g
      {...activation(onActivate)}
      aria-label={`${from.label} to ${to.label}${edge.label ? `: ${edge.label}` : ""}${removed ? " (removed)" : ""}. Ask about it.`}
      className={cn(
        "group/edge cursor-pointer outline-none t3team-pxp-fade",
        phase === "entering" && "t3team-pxp-enter",
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
        <path d={d} fill="none" className="t3team-pxp-flow pointer-events-none stroke-primary" />
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
