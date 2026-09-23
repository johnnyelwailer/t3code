import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "~/t3team/t3team-types";

const DAY_MS = 24 * 60 * 60 * 1000;
const DONE_STATUSES = new Set(["done", "closed"]);

/**
 * The viewer's personal burndown on the sprint time axis: assigned work (closed or open) is the
 * total, open work remains. Story points when present, counts otherwise; no history in the
 * graph, so the actual line has one anchor: today.
 */
export type DigestBurndown = {
  readonly start: number;
  readonly end: number;
  readonly total: number;
  readonly remaining: number;
  readonly openCount: number;
  readonly doneCount: number;
  readonly unit: string;
};

export function digestPersonalBurndown(graph: DigestGraph): DigestBurndown | null {
  const sprint = graph.sprint;
  if (!sprint) return null;
  const viewer = graph.viewer.name.trim().toLowerCase();
  const mine = graph.tickets.filter((t) => (t.assignee ?? "").trim().toLowerCase() === viewer);
  const hasPoints = mine.some((t) => (t.estimateValue ?? 0) > 0);
  const weightOf = (t: ProjectTicket) => (hasPoints ? (t.estimateValue ?? 0) : 1);
  const open = mine.filter((t) => !DONE_STATUSES.has(t.status.toLowerCase()));
  return {
    start: Date.parse(sprint.startDate),
    end: Date.parse(sprint.endDate),
    total: mine.reduce((sum, t) => sum + weightOf(t), 0),
    remaining: open.reduce((sum, t) => sum + weightOf(t), 0),
    openCount: open.length,
    doneCount: mine.length - open.length,
    unit: hasPoints ? "pts" : "items",
  };
}

function axisPct(b: DigestBurndown, nowMs: number): number {
  return Math.min(100, Math.max(0, ((nowMs - b.start) / (b.end - b.start)) * 100));
}

/**
 * Variant A — a readable mini burndown chart: ideal line to zero, actual line anchored at
 * today's remaining work, day ticks, now marker. Non-scaling strokes stay crisp when stretched.
 */
export function DigestBurndownChart({ graph, nowMs }: { graph: DigestGraph; nowMs: number }) {
  const b = digestPersonalBurndown(graph);
  if (!b) return null;
  if (b.total === 0)
    return (
      <p className="rounded-md bg-muted/30 px-2 py-2 text-[11px] text-muted-foreground">
        Nothing assigned to you this sprint
      </p>
    );
  const H = 40;
  const pct = axisPct(b, nowMs);
  const y = (v: number) => 3 + (v / b.total) * (H - 6);
  const days = Math.max(1, Math.round((b.end - b.start) / DAY_MS));
  const ticks =
    days <= 10 ? Array.from({ length: days - 1 }, (_, i) => (i + 1) / days) : [0.25, 0.5, 0.75];
  return (
    <div className="space-y-1">
      <div className="relative h-16 overflow-hidden rounded-md bg-muted/30 ring-1 ring-border/50">
        <svg
          viewBox={`0 0 100 ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-hidden="true"
        >
          {ticks.map((t) => (
            <line
              key={t}
              x1={t * 100}
              y1={0}
              x2={t * 100}
              y2={H}
              className="stroke-border/60"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1={0}
            y1={y(b.total)}
            x2={100}
            y2={y(0)}
            strokeDasharray="3 3"
            className="stroke-foreground/30"
            vectorEffect="non-scaling-stroke"
          />
          <polygon
            points={`0,${y(b.total)} ${pct},${y(b.remaining)} ${pct},${H} 0,${H}`}
            className="fill-foreground/10"
          />
          <line
            x1={0}
            y1={y(b.total)}
            x2={pct}
            y2={y(b.remaining)}
            className="stroke-foreground/80"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
          style={{ left: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        <b className="font-semibold text-foreground">{b.remaining}</b> of {b.total} {b.unit} left ·{" "}
        {b.doneCount} of {b.openCount + b.doneCount} done · dashed = ideal
      </p>
    </div>
  );
}

/**
 * Variant B — the same data as a quiet 14px sparkline strip: filled actual over the ideal line,
 * no axes. Replaces the thin time bar in place.
 */
export function DigestBurndownSparkline({ graph, nowMs }: { graph: DigestGraph; nowMs: number }) {
  const b = digestPersonalBurndown(graph);
  if (!b || b.total === 0) return null;
  const pct = axisPct(b, nowMs);
  const y = (v: number) => 2 + (v / b.total) * 10;
  return (
    <div
      className="relative h-3.5 overflow-hidden rounded-full bg-border/40"
      role="img"
      aria-label={`Burndown: ${b.remaining} of ${b.total} ${b.unit} remaining`}
    >
      <svg viewBox="0 0 100 14" preserveAspectRatio="none" className="h-full w-full">
        <line
          x1={0}
          y1={y(b.total)}
          x2={100}
          y2={y(0)}
          className="stroke-foreground/25"
          vectorEffect="non-scaling-stroke"
        />
        <polygon
          points={`0,${y(b.total)} ${pct},${y(b.remaining)} ${pct},14 0,14`}
          className="fill-foreground/20"
        />
        <line
          x1={0}
          y1={y(b.total)}
          x2={pct}
          y2={y(b.remaining)}
          className="stroke-foreground/70"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background bg-foreground"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}
