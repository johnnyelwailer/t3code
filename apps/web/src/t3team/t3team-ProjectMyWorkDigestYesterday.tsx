import { useId, useState } from "react";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import { DigestKicker, digestStatusDotClassName } from "~/t3team/t3team-ProjectMyWorkDigestChips";
import { DigestPrChip, DigestPrChips } from "~/t3team/t3team-ProjectMyWorkDigestPrChips";
import type {
  DigestChangeRequest,
  DigestGraph,
  DigestSection,
  DigestYesterdayMerged,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import { digestRepoLabeler } from "~/t3team/t3team-projectMyWorkDigestRepoLabels";
import {
  digestYesterdayRecap,
  digestYesterdaySummaryText,
  isDigestMorning,
  type DigestYesterdayWorkItem,
} from "~/t3team/t3team-projectMyWorkDigestYesterdayRecap";
import type { ProjectTicket } from "~/t3team/t3team-types";

// A merged PR in the shape the digest's PR chip reads; no project means no in-app aside.
const asChangeRequest = (pr: DigestYesterdayMerged): DigestChangeRequest => ({
  id: pr.id,
  ticketId: pr.ticketId ?? "",
  title: pr.title,
  ...(pr.projectId !== "" ? { projectId: pr.projectId } : {}),
  ...(pr.host !== undefined ? { host: pr.host } : {}),
  repo: pr.repo,
  number: pr.number,
  state: "merged",
  reviewers: [],
  updatedAt: pr.mergedAt,
});

const lineClassName = "min-w-0 space-y-1 px-3 py-1.5 text-xs";

/** One work item: key and title, where it ended up, then the PRs merged for it as chips. */
function WorkItemLine({
  item,
  repoLabel,
  onOpenTicket,
}: {
  item: DigestYesterdayWorkItem;
  repoLabel: (repo: string) => string;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
}) {
  const { ticketId } = item;
  return (
    <li className={lineClassName}>
      <div className="flex min-w-0 items-baseline gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                disabled={!onOpenTicket || ticketId === undefined}
                onClick={() => (ticketId !== undefined ? onOpenTicket?.(ticketId) : undefined)}
                className="flex min-w-0 flex-1 items-baseline gap-2 text-left enabled:hover:text-foreground"
              >
                <span className="shrink-0 font-mono text-muted-foreground">{item.key}</span>
                <span className="min-w-0 truncate">{item.title}</span>
              </button>
            }
          />
          <TooltipPopup side="top" className="max-w-sm">
            {item.key} · {item.title}
            {item.outcome?.from !== undefined ? ` · ${item.outcome.from} → ${item.outcome.to}` : ""}
          </TooltipPopup>
        </Tooltip>
        {item.outcome ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-2xs text-muted-foreground">
            <span aria-hidden="true" className={digestStatusDotClassName(item.outcome.to)} />→{" "}
            {item.outcome.to}
          </span>
        ) : null}
      </div>
      {item.merged.length > 0 ? (
        <DigestPrChips prs={item.merged.map(asChangeRequest)} repoLabel={repoLabel} />
      ) : null}
    </li>
  );
}

/** A merged PR that names no work item: the chip, then its title. */
function LoosePrLine({
  pr,
  repoLabel,
}: {
  pr: DigestYesterdayMerged;
  repoLabel: (repo: string) => string;
}) {
  return (
    <li className="flex min-w-0 items-center gap-2 px-3 py-1.5 text-xs">
      <DigestPrChip pr={asChangeRequest(pr)} repoLabel={repoLabel} />
      <span className="min-w-0 flex-1 truncate">{pr.title}</span>
    </li>
  );
}

/**
 * The `my-work.yesterday` widget: what the viewer finished on their previous working day, one
 * line per work item with its outcome and merged PRs, under a one-line summary. Before noon it
 * opens expanded; later it starts folded to the summary. Reads the graph itself
 * (`content: "none"`), so the section lists nothing.
 */
export function DigestYesterdayWidget({
  section,
  graph,
  ticketsById,
  nowMs,
  onOpenTicket,
}: {
  section: DigestSection;
  graph: DigestGraph;
  ticketsById: ReadonlyMap<string, ProjectTicket>;
  nowMs: number;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
}) {
  const [expanded, setExpanded] = useState(() => isDigestMorning(nowMs));
  const listId = useId();
  const recap = digestYesterdayRecap(graph.yesterday, ticketsById);
  if (recap.items.length + recap.loosePrs.length === 0) return null;
  const repoLabel = digestRepoLabeler((graph.yesterday?.merged ?? []).map((pr) => pr.repo));
  return (
    <section className="space-y-2">
      <DigestKicker
        right={
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((value) => !value)}
            className="text-2xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? "Hide" : "Show"}
          </button>
        }
      >
        {section.heading}
      </DigestKicker>
      <p className="text-xs text-foreground/80">{digestYesterdaySummaryText(recap.summary)}</p>
      <div id={listId} hidden={!expanded}>
        <T3SurfacePanel tone="muted">
          <ul className="divide-y divide-border/60">
            {recap.items.map((item) => (
              <WorkItemLine
                key={item.id}
                item={item}
                repoLabel={repoLabel}
                onOpenTicket={onOpenTicket}
              />
            ))}
            {recap.loosePrs.map((pr) => (
              <LoosePrLine key={pr.id} pr={pr} repoLabel={repoLabel} />
            ))}
          </ul>
        </T3SurfacePanel>
      </div>
    </section>
  );
}
