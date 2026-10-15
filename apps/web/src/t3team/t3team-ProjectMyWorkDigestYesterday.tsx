import { EllipsisIcon } from "lucide-react";
import { useId, useState } from "react";

import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/t3team/components/ui/t3team-menu";

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
import {
  digestParentGroups,
  type DigestParentGroup,
} from "~/t3team/t3team-projectMyWorkDigestParentGroups";
import { digestRepoLabeler } from "~/t3team/t3team-projectMyWorkDigestRepoLabels";
import {
  digestYesterdayGroupProgress,
  digestYesterdayRecap,
  digestYesterdaySummaryText,
  isDigestMorning,
  type DigestYesterdayWorkItem,
} from "~/t3team/t3team-projectMyWorkDigestYesterdayRecap";
import type { ProjectTicket } from "~/t3team/t3team-types";

// A merged PR in the shape the digest's PR chip reads; no project means no in-app aside. Every
// recap PR is merged, so the chips leave the state badge off.
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
const titleClassName = "flex min-w-0 flex-1 items-baseline gap-2 text-left";

/** One work item: key and title, where it ended up, then the PRs merged for it as chips. */
function WorkItemLine({
  item,
  repoLabel,
  onOpenTicket,
  nested = false,
}: {
  item: DigestYesterdayWorkItem;
  repoLabel: (repo: string) => string;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
  nested?: boolean;
}) {
  const { ticketId } = item;
  const label = (
    <>
      <span className="shrink-0 font-mono text-muted-foreground">{item.key}</span>
      <span className="min-w-0 truncate">{item.title}</span>
    </>
  );
  return (
    <li className={nested ? "min-w-0 space-y-1 py-1 pr-3 pl-3 text-xs" : lineClassName}>
      <div className="flex min-w-0 items-baseline gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              onOpenTicket && ticketId !== undefined ? (
                <button
                  type="button"
                  onClick={() => onOpenTicket(ticketId)}
                  className={`${titleClassName} hover:text-foreground`}
                >
                  {label}
                </button>
              ) : (
                // Not openable, but still focusable so the tooltip reaches keyboard users too.
                <span tabIndex={0} className={titleClassName}>
                  {label}
                </span>
              )
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
        <DigestPrChips
          prs={item.merged.map(asChangeRequest)}
          repoLabel={repoLabel}
          showState={false}
        />
      ) : null}
    </li>
  );
}

/**
 * A story with the subtasks that moved under it: the story's key and title as the header with
 * a compact "2/3 done" (and the story's own outcome and PRs when it moved too), the subtasks
 * nested below with their own statuses.
 */
function StoryGroupLine({
  group,
  repoLabel,
  onOpenTicket,
}: {
  group: DigestParentGroup<DigestYesterdayWorkItem> & { parent: ProjectTicket };
  repoLabel: (repo: string) => string;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
}) {
  const { parent, parentItem } = group;
  const progress = digestYesterdayGroupProgress(group.items);
  const label = (
    <>
      <span className="shrink-0 font-mono text-muted-foreground">{parent.ref.displayId}</span>
      <span className="min-w-0 truncate font-medium">{parent.ref.title}</span>
    </>
  );
  return (
    <li className={lineClassName} data-testid="digest-yesterday-story-group">
      <div className="flex min-w-0 items-baseline gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              onOpenTicket ? (
                <button
                  type="button"
                  onClick={() => onOpenTicket(parent.id)}
                  className={`${titleClassName} hover:text-foreground`}
                >
                  {label}
                </button>
              ) : (
                <span tabIndex={0} className={titleClassName}>
                  {label}
                </span>
              )
            }
          />
          <TooltipPopup side="top" className="max-w-sm">
            {parent.ref.displayId} · {parent.ref.title}
          </TooltipPopup>
        </Tooltip>
        {parentItem?.outcome ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-2xs text-muted-foreground">
            <span aria-hidden="true" className={digestStatusDotClassName(parentItem.outcome.to)} />→{" "}
            {parentItem.outcome.to}
          </span>
        ) : null}
        {progress !== "" ? (
          <span
            data-testid="digest-yesterday-group-progress"
            className="ml-auto shrink-0 truncate text-2xs whitespace-nowrap text-muted-foreground tabular-nums"
          >
            {progress}
          </span>
        ) : null}
      </div>
      {parentItem && parentItem.merged.length > 0 ? (
        <DigestPrChips
          prs={parentItem.merged.map(asChangeRequest)}
          repoLabel={repoLabel}
          showState={false}
        />
      ) : null}
      <ul className="ml-1 border-l border-border/70">
        {group.items.map((item) => (
          <WorkItemLine
            key={item.id}
            item={item}
            repoLabel={repoLabel}
            onOpenTicket={onOpenTicket}
            nested
          />
        ))}
      </ul>
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
      <DigestPrChip pr={asChangeRequest(pr)} repoLabel={repoLabel} showState={false} />
      <span className="min-w-0 flex-1 truncate">{pr.title}</span>
    </li>
  );
}

/**
 * The `my-work.yesterday` widget: what the viewer finished on their last working day, one
 * line per work item with its outcome and merged PRs, under a one-line summary. Subtasks group
 * under their parent story. Before noon it opens expanded; later it starts folded to the summary
 * (click the summary, or the hover-only ⋯ menu, to unfold — no permanent Hide control). Reads the graph itself
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
  const groups = digestParentGroups(recap.items, (item) => item.ticketId, ticketsById);
  const repoLabel = digestRepoLabeler((graph.yesterday?.merged ?? []).map((pr) => pr.repo));
  return (
    <section className="group/yesterday space-y-2">
      <DigestKicker
        right={
          <Menu>
            <MenuTrigger
              aria-label="Yesterday options"
              render={
                <button
                  type="button"
                  className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/yesterday:opacity-100 group-focus-within/yesterday:opacity-100 hover:text-foreground focus-visible:opacity-100 data-[popup-open]:opacity-100"
                />
              }
            >
              <EllipsisIcon className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="end" side="bottom">
              <MenuItem onClick={() => setExpanded((value) => !value)}>
                {expanded ? "Collapse" : "Expand"}
              </MenuItem>
            </MenuPopup>
          </Menu>
        }
      >
        {section.heading}
      </DigestKicker>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((value) => !value)}
        className="block text-left text-xs text-foreground/80 hover:text-foreground"
      >
        {digestYesterdaySummaryText(recap.summary)}
      </button>
      <div id={listId} hidden={!expanded}>
        <T3SurfacePanel tone="muted">
          <ul className="divide-y divide-border/60">
            {groups.map((group) =>
              group.parent ? (
                <StoryGroupLine
                  key={`story:${group.parent.id}`}
                  group={{ ...group, parent: group.parent }}
                  repoLabel={repoLabel}
                  onOpenTicket={onOpenTicket}
                />
              ) : (
                group.items.map((item) => (
                  <WorkItemLine
                    key={item.id}
                    item={item}
                    repoLabel={repoLabel}
                    onOpenTicket={onOpenTicket}
                  />
                ))
              ),
            )}
            {recap.loosePrs.map((pr) => (
              <LoosePrLine key={pr.id} pr={pr} repoLabel={repoLabel} />
            ))}
          </ul>
        </T3SurfacePanel>
      </div>
    </section>
  );
}
