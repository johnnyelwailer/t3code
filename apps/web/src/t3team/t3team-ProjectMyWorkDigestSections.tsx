import { useState } from "react";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { DigestItemRow, DigestKicker } from "~/t3team/t3team-ProjectMyWorkDigestRows";
import { DigestStoryGroup } from "~/t3team/t3team-ProjectMyWorkDigestStoryGroup";
import type { DigestGraph, DigestSection } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { buildProjectTicketHierarchy } from "~/t3team/t3team-ticketHierarchy";
import type { ProjectTicket } from "~/t3team/t3team-types";

export type LaneProps = {
  graph: DigestGraph;
  ticketsById: ReadonlyMap<string, ProjectTicket>;
  nowMs: number;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
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
      {section.hint ? <p className="text-[11.5px] text-muted-foreground">{section.hint}</p> : null}
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

export function groupByParent(
  section: DigestSection,
  graph: DigestGraph,
  ticketsById: ReadonlyMap<string, ProjectTicket>,
) {
  const hierarchy = buildProjectTicketHierarchy(graph.tickets);
  const groups = new Map<
    string | null,
    { parent: ProjectTicket | null; items: typeof section.items; otherChildren: ProjectTicket[] }
  >();
  for (const item of section.items) {
    const parentId = hierarchy.parentByChildId.get(item.ticketId) ?? null;
    const parent = parentId ? (ticketsById.get(parentId) ?? null) : null;
    const key = parent?.id ?? null;
    const group = groups.get(key) ?? { parent, items: [], otherChildren: [] };
    groups.set(key, { ...group, items: [...group.items, item] });
  }
  // For each story group, surface the children NOT rendered as full rows above, so the group
  // shows the whole story at a glance.
  for (const group of groups.values()) {
    if (!group.parent) continue;
    const active = new Set(group.items.map((item) => item.ticketId));
    group.otherChildren = (hierarchy.childrenByParentId.get(group.parent.id) ?? []).filter(
      (child) => !active.has(child.id),
    );
  }
  return [...groups.values()];
}

export function MainSection({
  section,
  graph,
  ticketsById,
  nowMs,
  onOpenTicket,
}: LaneProps & { section: DigestSection }) {
  return (
    <section className="space-y-2">
      <DigestKicker count={section.items.length}>{section.heading}</DigestKicker>
      {section.hint ? <p className="text-[11.5px] text-muted-foreground">{section.hint}</p> : null}
      <div className="grid gap-3 2xl:grid-cols-2">
        {groupByParent(section, graph, ticketsById).map((group) => {
          if (!group.parent) {
            return (
              <T3SurfacePanel key="standalone" tone="muted" className="divide-y divide-border/50">
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
              otherChildren={group.otherChildren}
              viewerName={graph.viewer.name}
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
          className="flex w-full items-center gap-3 px-3 py-2 text-left text-[12.5px]"
        >
          <span className="text-xl font-semibold tabular-nums">{section.items.length}</span>
          <span className="text-muted-foreground">{section.hint ?? "nothing needed from you"}</span>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {open ? "Hide" : "Show"}
          </span>
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
