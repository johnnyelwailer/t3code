import type { T3TeamExplainerSequenceBlock } from "./model/t3team-explainer";
import { cn } from "./t3team-explainerHostKit";
import { useId } from "react";

const COL = 112;
const PAD_X = 56;
const HEAD = 30;
const ROW = 30;

const LINE_TONE = {
  added: "stroke-diff-addition-foreground",
  removed: "stroke-diff-deletion-foreground/70",
  unchanged: "stroke-muted-foreground",
} as const;

const TEXT_TONE = {
  added: "fill-diff-addition-foreground",
  removed: "fill-diff-deletion-foreground/70",
  unchanged: "fill-muted-foreground",
} as const;

/** Who calls whom, in order. Added calls are green, removed ones crossed out. */
export function ExplainerSequence({ block: visual }: { block: T3TeamExplainerSequenceBlock }) {
  const titleId = useId();
  const markerId = useId();
  const column = new Map(visual.actors.map((actor, index) => [actor.id, index]));
  const width = PAD_X * 2 + (visual.actors.length - 1) * COL;
  const height = HEAD + 14 + visual.messages.length * ROW;
  const x = (actorId: string) => PAD_X + (column.get(actorId) ?? 0) * COL;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby={titleId}
      className="block h-auto max-h-72 w-full"
    >
      <title id={titleId}>
        {`Sequence: ${visual.messages
          .map(
            (message) =>
              `${message.label}${message.change === "unchanged" ? "" : ` (${message.change})`}`,
          )
          .join(", ")}`}
      </title>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
        </marker>
      </defs>
      {visual.actors.map((actor) => (
        <g key={actor.id}>
          <rect
            x={x(actor.id) - 46}
            y={2}
            width={92}
            height={22}
            rx={6}
            className="fill-card stroke-border"
          />
          <text
            x={x(actor.id)}
            y={17}
            textAnchor="middle"
            className="fill-foreground text-3xs font-medium"
          >
            {actor.label}
          </text>
          <line
            x1={x(actor.id)}
            y1={24}
            x2={x(actor.id)}
            y2={height - 4}
            className="stroke-border [stroke-dasharray:3_3]"
          />
        </g>
      ))}
      {visual.messages.map((message, index) => {
        const y = HEAD + 14 + index * ROW;
        const x1 = x(message.from);
        const x2 = x(message.to);
        const self = x1 === x2;
        const d = self
          ? `M ${x1} ${y - 6} h 22 v 12 h -18`
          : `M ${x1} ${y} L ${x2 + (x2 > x1 ? -3 : 3)} ${y}`;
        return (
          <g
            key={message.id}
            className={cn("t3team-xp-stream-in", message.change === "removed" && "opacity-70")}
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <path
              d={d}
              fill="none"
              markerEnd={`url(#${markerId})`}
              strokeWidth={message.change === "added" ? 1.75 : 1.25}
              className={cn(
                LINE_TONE[message.change],
                (message.style !== "call" || message.change === "removed") &&
                  "[stroke-dasharray:4_3]",
              )}
            />
            <text
              x={self ? x1 + 30 : (x1 + x2) / 2}
              y={self ? y + 3 : y - 5}
              textAnchor={self ? "start" : "middle"}
              className={cn(
                "text-3xs",
                TEXT_TONE[message.change],
                message.change === "removed" && "line-through",
              )}
            >
              {message.change === "added" ? "+ " : message.change === "removed" ? "− " : ""}
              {message.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
