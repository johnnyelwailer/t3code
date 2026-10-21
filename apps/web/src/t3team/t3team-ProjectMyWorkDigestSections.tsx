import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { DigestCompactRow } from "~/t3team/t3team-ProjectMyWorkDigestCompactRow";
import { DigestItemRow, DigestKicker } from "~/t3team/t3team-ProjectMyWorkDigestRows";
import { DigestStoryGroup } from "~/t3team/t3team-ProjectMyWorkDigestStoryGroup";
import type { DigestGraph, DigestSection } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { groupByParent } from "~/t3team/t3team-projectMyWorkDigestGroups";
import { digestParentGroups } from "~/t3team/t3team-projectMyWorkDigestParentGroups";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { digestTransitionStyle } from "~/t3team/t3team-digestViewTransition";
import { useDigestTransitionNames } from "~/t3team/t3team-digestTransitionNames";

export type LaneProps = {
  graph: DigestGraph;
  ticketsById: ReadonlyMap<string, ProjectTicket>;
  nowMs: number;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
  /** Tickets the open lanes already show; story chips leave them out. */
  shownTicketIds?: ReadonlySet<string>;
  /** Tickets the open lanes render as rows; a story among them keeps its PRs off its header. */
  rowTicketIds?: ReadonlySet<string>;
};

/**
 * A flat section's rows with subtasks under their parent story, so a bare "FE: Review" row reads
 * in context: the story's own row (or, when the section does not list it, a slim key + title
 * line) heads the group, its subtasks nest below. Other rows stay as they were.
 */
function ParentGroupedRows({
  section,
  graph,
  ticketsById,
  nowMs,
  onOpenTicket,
}: LaneProps & { section: DigestSection }) {
  const names = useDigestTransitionNames();
  const row = (item: DigestSection["items"][number], nested = false) => {
    const ticket = ticketsById.get(item.ticketId);
    if (ticket && item.compact) {
      const name = names.row(section.id, ticket.id);
      return (
        <DigestCompactRow
          key={ticket.id}
          transitionName={name}
          ticket={ticket}
          why={item.why}
          onOpenTicket={onOpenTicket}
        />
      );
    }
    return ticket ? (
      <DigestItemRow
        key={ticket.id}
        transitionName={names.row(section.id, ticket.id)}
        ticket={ticket}
        why={item.why}
        graph={graph}
        nowMs={nowMs}
        onOpenTicket={onOpenTicket}
        {...(nested ? { dependencies: false } : {})}
      />
    ) : null;
  };
  return digestParentGroups(section.items, (item) => item.ticketId, ticketsById).map((group) => {
    const { parent } = group;
    if (!parent) return group.items.map((item) => row(item));
    return (
      <div key={`story:${parent.id}`} data-testid="digest-section-story-group">
        {group.parentItem !== undefined ? (
          row(group.parentItem)
        ) : (
          <button
            type="button"
            disabled={!onOpenTicket}
            onClick={() => onOpenTicket?.(parent.id)}
            className="flex w-full min-w-0 items-baseline gap-2 px-3 pt-2 text-left text-2xs text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground"
          >
            <span className="shrink-0 font-mono">{parent.ref.displayId}</span>
            <span className="min-w-0 truncate">{parent.ref.title}</span>
          </button>
        )}
        <div className="ml-3 border-l border-border/70">
          {group.items.map((item) => row(item, true))}
        </div>
      </div>
    );
  });
}

export function SideSection({
  section,
  graph,
  ticketsById,
  nowMs,
  onOpenTicket,
}: LaneProps & { section: DigestSection }) {
  return (
    <section className="space-y-2">
      <DigestKicker count={section.items.length}>{section.heading}</DigestKicker>
      {section.hint ? <p className="text-xs text-muted-foreground">{section.hint}</p> : null}
      <T3SurfacePanel
        tone={section.id.includes("needs-you") ? "default" : "muted"}
        className="divide-y divide-border/60"
      >
        <ParentGroupedRows
          section={section}
          graph={graph}
          ticketsById={ticketsById}
          nowMs={nowMs}
          onOpenTicket={onOpenTicket}
        />
      </T3SurfacePanel>
    </section>
  );
}

export function MainSection({
  section,
  graph,
  ticketsById,
  nowMs,
  onOpenTicket,
  shownTicketIds,
  rowTicketIds,
}: LaneProps & { section: DigestSection }) {
  const names = useDigestTransitionNames();
  return (
    <section className="space-y-2">
      <DigestKicker count={section.items.length}>{section.heading}</DigestKicker>
      {section.hint ? <p className="text-xs text-muted-foreground">{section.hint}</p> : null}
      <div className="grid grid-cols-1 items-start gap-3 @3xl/lane:grid-cols-2">
        {groupByParent(section, graph, ticketsById, shownTicketIds, rowTicketIds).map((group) => {
          if (!group.parent) {
            return (
              <T3SurfacePanel
                key="standalone"
                tone="muted"
                className="min-w-0 divide-y divide-border/50 overflow-hidden"
                style={digestTransitionStyle(names.standalone(section.id))}
              >
                {group.items.map((item) => {
                  const ticket = ticketsById.get(item.ticketId);
                  if (!ticket) return null;
                  return (
                    <DigestItemRow
                      key={ticket.id}
                      transitionName={names.row(section.id, ticket.id)}
                      ticket={ticket}
                      why={item.why}
                      graph={graph}
                      nowMs={nowMs}
                      onOpenTicket={onOpenTicket}
                    />
                  );
                })}
              </T3SurfacePanel>
            );
          }
          return (
            <DigestStoryGroup
              key={group.parent.id}
              transitionName={names.story(section.id, group.parent.id)}
              story={group.parent}
              graph={graph}
              nowMs={nowMs}
              adjacency={group.adjacency}
              showStoryPrs={group.showStoryPrs}
              onOpenTicket={onOpenTicket}
            >
              {group.items.map((item) => {
                const ticket = ticketsById.get(item.ticketId);
                if (!ticket) return null;
                return (
                  <DigestItemRow
                    key={ticket.id}
                    transitionName={names.row(section.id, ticket.id)}
                    ticket={ticket}
                    why={item.why}
                    graph={graph}
                    nowMs={nowMs}
                    onOpenTicket={onOpenTicket}
                    dependencies={false}
                  />
                );
              })}
            </DigestStoryGroup>
          );
        })}
      </div>
    </section>
  );
}

export function FooterSection({
  section,
  graph,
  ticketsById,
  nowMs,
  onOpenTicket,
}: LaneProps & { section: DigestSection }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-2">
      <DigestKicker count={section.items.length}>{section.heading}</DigestKicker>
      <T3SurfacePanel tone="muted" className="divide-y divide-border/60">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs"
        >
          <span className="text-xl font-semibold tabular-nums">{section.items.length}</span>
          <span className="text-muted-foreground">{section.hint ?? "nothing needed from you"}</span>
          <ChevronDownIcon
            aria-hidden="true"
            className={`ml-auto size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open ? (
          <ParentGroupedRows
            section={section}
            graph={graph}
            ticketsById={ticketsById}
            nowMs={nowMs}
            onOpenTicket={onOpenTicket}
          />
        ) : null}
      </T3SurfacePanel>
    </section>
  );
}
