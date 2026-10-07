import { useState } from "react";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { DigestItemRow, DigestKicker } from "~/t3team/t3team-ProjectMyWorkDigestRows";
import { DigestStoryGroup } from "~/t3team/t3team-ProjectMyWorkDigestStoryGroup";
import type { DigestGraph, DigestSection } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { groupByParent } from "~/t3team/t3team-projectMyWorkDigestGroups";
import type { ProjectTicket } from "~/t3team/t3team-types";

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
        {section.items.map((item) => {
          const ticket = ticketsById.get(item.ticketId);
          return ticket ? (
            <DigestItemRow
              key={ticket.id}
              ticket={ticket}
              why={item.why}
              graph={graph}
              nowMs={nowMs}
              onOpenTicket={onOpenTicket}
            />
          ) : null;
        })}
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
              >
                {group.items.map((item) => {
                  const ticket = ticketsById.get(item.ticketId);
                  if (!ticket) return null;
                  return (
                    <DigestItemRow
                      key={ticket.id}
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
          className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs"
        >
          <span className="text-xl font-semibold tabular-nums">{section.items.length}</span>
          <span className="text-muted-foreground">{section.hint ?? "nothing needed from you"}</span>
          <span className="ml-auto text-2xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
        </button>
        {open
          ? section.items.map((item) => {
              const ticket = ticketsById.get(item.ticketId);
              return ticket ? (
                <DigestItemRow
                  key={ticket.id}
                  ticket={ticket}
                  why={item.why}
                  graph={graph}
                  nowMs={nowMs}
                  onOpenTicket={onOpenTicket}
                />
              ) : null;
            })
          : null}
      </T3SurfacePanel>
    </section>
  );
}
