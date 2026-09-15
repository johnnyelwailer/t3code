import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import {
  DigestBurndownChart,
  DigestBurndownSparkline,
} from "~/t3team/t3team-ProjectMyWorkDigestBurndown";
import { formatDigestAgo } from "~/t3team/t3team-ProjectMyWorkDigestChips";

/**
 * The digest's data-source status. Read-only: the deterministic layer refreshes on its own
 * ("auto"); the owner's live "arranging · 2 h" read was a status-reading bug — the view shows
 * when the data was last updated, not a vague in-progress verb.
 */
function DigestAutoStatus({ updatedAtMs, nowMs }: { updatedAtMs: number; nowMs: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-1.5 rounded-full bg-success" aria-hidden />
      auto · updated {formatDigestAgo(nowMs, new Date(updatedAtMs).toISOString())} ago
    </span>
  );
}

/**
 * How the sprint time axis is drawn: the 4px elapsed-time bar of today, the personal burndown
 * chart, or its sparkline form. The real app feeds this from the Beta feature flag.
 */
export type DigestBurndownVariant = "off" | "chart" | "sparkline";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDay(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.`;
}

export function ProjectMyWorkDigestHeader({
  graph,
  nowMs,
  burndownVariant = "off",
  updatedAtMs,
}: {
  graph: DigestGraph;
  nowMs: number;
  burndownVariant?: DigestBurndownVariant;
  updatedAtMs?: number;
}) {
  const sprint = graph.sprint;
  const scopeLabel =
    graph.scope === "all" ? `All projects · ${graph.projects.length}` : graph.projects[0]?.name;
  if (!sprint) {
    return (
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2 border-b border-border/70 pb-4">
        <div>
          <p className="text-[11px] tracking-wide text-muted-foreground">Digest · {scopeLabel}</p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">My Work</h1>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground sm:gap-x-7">
          {graph.scope === "all"
            ? graph.projects.map((project) => (
                <span key={project.id}>
                  <b className="font-semibold text-foreground">
                    {graph.tickets.filter((t) => t.projectId === project.id).length}
                  </b>{" "}
                  {project.name}
                </span>
              ))
            : null}
          <span>
            {graph.viewer.name} · {graph.viewer.role}
          </span>
          {updatedAtMs !== undefined ? (
            <DigestAutoStatus updatedAtMs={updatedAtMs} nowMs={nowMs} />
          ) : null}
        </div>
      </header>
    );
  }
  const start = Date.parse(sprint.startDate);
  const end = Date.parse(sprint.endDate);
  const total = Math.max(1, Math.round((end - start) / DAY_MS));
  const day = Math.min(total, Math.max(1, Math.ceil((nowMs - start) / DAY_MS)));
  const pct = Math.round(((nowMs - start) / (end - start)) * 100);
  return (
    <header className="space-y-4 border-b border-border/70 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2">
        <div>
          <p className="text-[11px] tracking-wide text-muted-foreground">Digest · {scopeLabel}</p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {sprint.name}{" "}
            <span className="font-normal text-muted-foreground">
              · Day {day} of {total}
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground sm:gap-x-7">
          <span>
            {formatDay(sprint.startDate)} – {formatDay(sprint.endDate)}
          </span>
          <span>
            <b className="font-semibold text-foreground">{total - day}</b> days left
          </span>
          <span>
            {graph.viewer.name} · {graph.viewer.role}
          </span>
          {updatedAtMs !== undefined ? (
            <DigestAutoStatus updatedAtMs={updatedAtMs} nowMs={nowMs} />
          ) : null}
        </div>
      </div>
      <div className="space-y-1.5">
        {burndownVariant === "chart" ? (
          <DigestBurndownChart graph={graph} nowMs={nowMs} />
        ) : burndownVariant === "sparkline" ? (
          <DigestBurndownSparkline graph={graph} nowMs={nowMs} />
        ) : (
          <div className="relative h-1 rounded-full bg-border">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-foreground/70"
              style={{ width: `${pct}%` }}
            />
            <div
              className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
              style={{ left: `${pct}%` }}
            />
          </div>
        )}
        <div className="flex justify-between text-[10.5px] text-muted-foreground/80">
          <span>{formatDay(sprint.startDate)}</span>
          <span>
            {pct} % elapsed · today {formatDay(new Date(nowMs).toISOString())}
          </span>
          <span>{formatDay(sprint.endDate)}</span>
        </div>
      </div>
      {sprint.goal.length > 0 ? (
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-muted-foreground">
          {sprint.goal.map((line) => (
            <li
              key={line}
              className="before:mr-1.5 before:text-muted-foreground/50 before:content-['–']"
            >
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}
