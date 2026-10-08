import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import { DigestSprintAxis } from "~/t3team/t3team-ProjectMyWorkDigestSprintAxis";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import {
  DigestBurndownChart,
  DigestBurndownSparkline,
} from "~/t3team/t3team-ProjectMyWorkDigestBurndown";
import { formatDigestAgo } from "~/t3team/t3team-ProjectMyWorkDigestChips";
import { digestSprintProgress } from "~/t3team/t3team-projectMyWorkDigestSprintProgress";

/**
 * The digest's data-source status: when Jira was last matched, not when this view fetched —
 * a fetch reads "just now" over a mirror days old. Amber once the sync is over an hour old.
 * Falls back to the fetch time only when the server reports no sync at all.
 */
const JIRA_SYNC_STALE_MS = 60 * 60 * 1000;

function DigestAutoStatus({
  updatedAtMs,
  jiraSyncedAt,
  changeRequestNote,
  nowMs,
}: {
  updatedAtMs: number | undefined;
  jiraSyncedAt: string | undefined;
  changeRequestNote?: string | undefined;
  nowMs: number;
}) {
  // PRs that may be old or missing (the host rate-limited the read): said here, beside the sync.
  const prNotice = changeRequestNote ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex items-center gap-1.5 text-warning">
            <span className="size-1.5 rounded-full bg-warning" aria-hidden />
            Some PRs may be out of date
          </span>
        }
      />
      <TooltipPopup side="top" className="max-w-xs">
        {changeRequestNote}
      </TooltipPopup>
    </Tooltip>
  ) : null;
  if (jiraSyncedAt === undefined && updatedAtMs === undefined) return prNotice;
  const stale = jiraSyncedAt !== undefined && nowMs - Date.parse(jiraSyncedAt) > JIRA_SYNC_STALE_MS;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`size-1.5 rounded-full ${stale ? "bg-warning" : "bg-success"}`}
          aria-hidden
        />
        {jiraSyncedAt !== undefined
          ? `Jira synced ${formatDigestAgo(nowMs, jiraSyncedAt)} ago`
          : `auto · updated ${formatDigestAgo(nowMs, new Date(updatedAtMs ?? nowMs).toISOString())} ago`}
      </span>
      {prNotice}
    </span>
  );
}

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
          />
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
          />
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
