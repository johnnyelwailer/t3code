import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { getProjectTicketKanbanLane } from "~/t3team/t3team-projectTicketStatus";

import { digestPersonalBurndown } from "./t3team-ProjectMyWorkDigestBurndown";

const H = 40;
const HOUR_S = 3600;

/**
 * The viewer's current-sprint tickets in hours: original estimates are the scope, remaining
 * estimates what is left (a finished ticket has none left). Null when the sprint carries no time
 * estimates for them.
 */
function sprintHours(graph: DigestGraph): { total: number; remaining: number } | null {
  const viewer = graph.viewer.name.trim().toLowerCase();
  const mine = graph.tickets.filter(
    (ticket) =>
      (ticket.assignee ?? "").trim().toLowerCase() === viewer &&
      ticket.sprintState?.toLowerCase() === "active" &&
      (ticket.timeOriginalEstimateSeconds ?? 0) > 0,
  );
  if (mine.length === 0) return null;
  const total = mine.reduce((sum, t) => sum + (t.timeOriginalEstimateSeconds ?? 0), 0);
  const remaining = mine.reduce(
    (sum, t) =>
      sum +
      (getProjectTicketKanbanLane(t.status) === "done" ? 0 : (t.timeRemainingEstimateSeconds ?? 0)),
    0,
  );
  return { total: Math.round(total / HOUR_S), remaining: Math.round(remaining / HOUR_S) };
}

function formatDay(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.`;
}

/**
 * The sprint's time axis as the viewer's own burndown: the ideal line from everything assigned to
 * zero, the actual remaining work day by day (the server's changelog backfill, `graph.burndown`),
 * and today. What it says in words is what is left, not how much calendar has passed.
 */
export function DigestSprintAxis({ graph, nowMs }: { graph: DigestGraph; nowMs: number }) {
  const sprint = graph.sprint;
  if (!sprint) return null;
  const start = Date.parse(sprint.startDate);
  const end = Date.parse(sprint.endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  // Hours first: Jira's remaining estimate drops as time is logged, so it moves while a ticket is
  // still open. Story points only move when a ticket reaches Done ("42 of 42" all sprint long).
  const hours = sprintHours(graph);
  const history = hours ? undefined : graph.burndown;
  const fallback = digestPersonalBurndown(graph);
  const total = hours?.total ?? history?.total ?? fallback?.total ?? 0;
  const unit = hours
    ? "h"
    : history
      ? history.unit === "hours"
        ? "h"
        : "pts"
      : (fallback?.unit ?? "items");
  const points: Array<{ at: number; remaining: number }> = hours
    ? [
        { at: start, remaining: hours.total },
        { at: Math.min(nowMs, end), remaining: hours.remaining },
      ]
    : history
      ? history.points.map((p) => ({ at: Date.parse(p.date), remaining: p.remaining }))
      : fallback
        ? [
            { at: start, remaining: fallback.total },
            { at: Math.min(nowMs, end), remaining: fallback.remaining },
          ]
        : [];
  const remaining = points.at(-1)?.remaining ?? total;

  const x = (at: number) => Math.min(100, Math.max(0, ((at - start) / (end - start)) * 100));
  const y = (value: number) => (total > 0 ? 3 + (1 - value / total) * (H - 6) : H - 3);
  // Ticket moves (the changelog history) are steps; hours have no history yet, only the scope at
  // the start and what is left now, so they draw as a slope between the two.
  const steps = points.flatMap((point, index) => {
    if (hours) return [`${x(point.at)},${y(point.remaining)}`];
    const prev = points[index - 1];
    const here = `${x(point.at)},${y(point.remaining)}`;
    return prev ? [`${x(point.at)},${y(prev.remaining)}`, here] : [here];
  });
  const today = x(nowMs);
  const ended = nowMs > end;
  // Hold the last known value up to today, so the line ends where the now-marker stands.
  const lastX = ended ? 100 : today;
  if (steps.length > 0) steps.push(`${lastX},${y(remaining)}`);
  const area =
    steps.length > 1 ? `${steps[0]?.split(",")[0]},${H} ${steps.join(" ")} ${lastX},${H}` : "";

  return (
    <div className="space-y-1.5">
      <div className="relative h-10 overflow-hidden rounded-md bg-muted/30">
        <svg
          viewBox={`0 0 100 ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`${remaining} of ${total} ${unit} left`}
        >
          {total > 0 ? (
            <line
              x1={0}
              y1={y(total)}
              x2={100}
              y2={y(0)}
              className="stroke-foreground/25"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {area ? <polygon points={area} className="fill-foreground/10" /> : null}
          {steps.length > 1 ? (
            <polyline
              points={steps.join(" ")}
              className="fill-none stroke-foreground/80"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {!ended ? (
            <line
              x1={today}
              y1={0}
              x2={today}
              y2={H}
              className="stroke-foreground/40"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        {total > 0 ? (
          <span
            className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-background"
            style={{ left: `${lastX}%`, top: `${(y(remaining) / H) * 100}%` }}
          />
        ) : null}
      </div>
      <div className="flex justify-between text-3xs text-muted-foreground/80">
        <span>{formatDay(start)}</span>
        <span>
          {total > 0 ? (
            <>
              <b className="font-semibold text-foreground">{remaining}</b> of {total} {unit} left
            </>
          ) : (
            "nothing assigned to you this sprint"
          )}
          {ended ? " · sprint over" : ` · today ${formatDay(nowMs)}`}
        </span>
        <span>{formatDay(end)}</span>
      </div>
    </div>
  );
}
