import { DigestAutoStatus } from "~/t3team/t3team-ProjectMyWorkDigestAutoStatus";
import { DigestSprintAxis } from "~/t3team/t3team-ProjectMyWorkDigestSprintAxis";
import { PrWatchDigestStatus } from "~/t3team/t3team-PrWatchDigestStatus";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import {
  DigestBurndownChart,
  DigestBurndownSparkline,
} from "~/t3team/t3team-ProjectMyWorkDigestBurndown";
import { digestSprintProgress } from "~/t3team/t3team-projectMyWorkDigestSprintProgress";

/**
 * How the sprint time axis is drawn: the 4px elapsed-time bar of today, the personal burndown
 * chart, or its sparkline form. The real app feeds this from the Beta feature flag.
 */
export type DigestBurndownVariant = "off" | "chart" | "sparkline";

function formatDay(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.`;
}

export function ProjectMyWorkDigestHeader({
  graph,
  nowMs,
  burndownVariant = "off",
  updatedAtMs,
  refreshing = false,
}: {
  graph: DigestGraph;
  nowMs: number;
  burndownVariant?: DigestBurndownVariant;
  updatedAtMs?: number;
  /** A revalidation is in flight over content already on screen; the status strip says so. */
  refreshing?: boolean;
}) {
  const sprint = graph.sprint;
  const scopeLabel =
    graph.scope === "all" ? `All projects · ${graph.projects.length}` : graph.projects[0]?.name;
  // The watch count is per project: an all-projects digest has no single run to read.
  const watchProjectId = graph.scope === "all" ? undefined : graph.projects[0]?.id;
  if (!sprint) {
    return (
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2 border-b border-border/70 pb-4">
        <div>
          <p className="text-2xs tracking-wide text-muted-foreground">Digest · {scopeLabel}</p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">My Work</h1>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground sm:gap-x-7">
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
          <DigestAutoStatus
            updatedAtMs={updatedAtMs}
            jiraSyncedAt={graph.jiraSyncedAt}
            changeRequestNote={graph.changeRequestNote}
            nowMs={nowMs}
            refreshing={refreshing}
          />
          <PrWatchDigestStatus projectId={watchProjectId} />
        </div>
      </header>
    );
  }
  const { total, day, daysLeft, pct, ended } = digestSprintProgress(sprint, nowMs);
  // No usable dates (the mapper collapses missing ones to a single instant): drop the day
  // counter, the date range and the progress row rather than print "Day 1 of 1" and a 0 % bar.
  const datesKnown = pct !== null;
  return (
    <header className="space-y-4 border-b border-border/70 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2">
        <div>
          <p className="text-2xs tracking-wide text-muted-foreground">Digest · {scopeLabel}</p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {sprint.name}{" "}
            {datesKnown ? (
              <span className="font-normal text-muted-foreground">
                · {ended ?? `Day ${day} of ${total}`}
              </span>
            ) : null}
          </h1>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground sm:gap-x-7">
          {datesKnown && ended === null ? (
            <span>
              <b className="font-semibold text-foreground">{daysLeft}</b> days left
            </span>
          ) : null}
          <DigestAutoStatus
            updatedAtMs={updatedAtMs}
            jiraSyncedAt={graph.jiraSyncedAt}
            changeRequestNote={graph.changeRequestNote}
            nowMs={nowMs}
            refreshing={refreshing}
          />
          <PrWatchDigestStatus projectId={watchProjectId} />
        </div>
      </div>
      {burndownVariant !== "off" || datesKnown ? (
        <div className="space-y-1.5">
          {burndownVariant === "chart" ? (
            <DigestBurndownChart graph={graph} nowMs={nowMs} />
          ) : burndownVariant === "sparkline" ? (
            <DigestBurndownSparkline graph={graph} nowMs={nowMs} />
          ) : (
            <DigestSprintAxis graph={graph} nowMs={nowMs} />
          )}
        </div>
      ) : null}
      {sprint.goal.length > 0 ? (
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
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
