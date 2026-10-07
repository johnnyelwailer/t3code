import type { T3TeamExplainerMapNode } from "./model/t3team-explainer";
import { cn } from "./t3team-explainerHostKit";
import { explainerMapActivation, type ExplainerMapActivate } from "./t3team-explainerMapActivation";
import { explainerNodeBox, type ExplainerNodeView } from "./t3team-explainerMapFrame";

const ROLE_TONE: Record<T3TeamExplainerMapNode["role"], string> = {
  ui: "fill-info",
  service: "fill-primary",
  store: "fill-success",
  external: "fill-muted-foreground",
  test: "fill-success",
};

const PHASE_WORD = {
  entering: "new",
  removing: "removed",
  gone: "removed",
  present: "",
  hidden: "",
};

export function ExplainerMapNode({
  view,
  onActivate,
}: {
  view: ExplainerNodeView;
  onActivate: ExplainerMapActivate;
}) {
  const { node, phase, focus, warn } = view;
  const box = explainerNodeBox(node);
  const status = [PHASE_WORD[phase], warn ? "needs a check" : focus ? "in this step" : ""]
    .filter(Boolean)
    .join(", ");
  return (
    <g
      {...explainerMapActivation(onActivate)}
      aria-label={`${node.label}${status ? ` (${status})` : ""}. Ask about it.`}
      className={cn(
        "group/node cursor-pointer outline-none t3team-xp-fade",
        phase === "entering" && "t3team-xp-enter",
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
          focus && "stroke-primary t3team-xp-pulse",
          warn && "fill-warning/12 stroke-warning t3team-xp-pulse",
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
