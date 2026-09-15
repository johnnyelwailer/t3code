import { useState } from "react";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { DigestItemRow, DigestKicker } from "~/t3team/t3team-ProjectMyWorkDigestRows";
import { DigestStoryGroup } from "~/t3team/t3team-ProjectMyWorkDigestStoryGroup";
import type {
  DigestGraph,
  DigestSection,
  ResolvedDigestPlan,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { T3TeamDigestBurndownVariant } from "~/t3team/t3team-betaFlags";
import { buildProjectTicketHierarchy } from "~/t3team/t3team-ticketHierarchy";
import type { ProjectTicket } from "~/t3team/t3team-types";

type LaneProps = {
  graph: DigestGraph;
  ticketsById: ReadonlyMap<string, ProjectTicket>;
  nowMs: number;
};

function SideSection({
  section,
  graph,
  ticketsById,
  nowMs,
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
            />
          ) : null;
        })}
      </T3SurfacePanel>
    </section>
  );
}

function groupByParent(
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

function MainSection({
  section,
  graph,
  ticketsById,
  nowMs,
}: LaneProps & { section: DigestSection }) {
  return (
    <section className="space-y-2">
      <DigestKicker count={section.items.length}>{section.heading}</DigestKicker>
      {section.hint ? <p className="text-[11.5px] text-muted-foreground">{section.hint}</p> : null}
      <div className="space-y-3">
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

function FooterSection({
  section,
  graph,
  ticketsById,
  nowMs,
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
                />
              ) : null;
            })
          : null}
      </T3SurfacePanel>
    </section>
  );
}

export function ProjectMyWorkDigestView({
  plan,
  graph,
  nowMs,
}: {
  plan: ResolvedDigestPlan;
  graph: DigestGraph;
  nowMs: number;
  /**
   * Beta flag (digestBurndownVariant). Accepted, not rendered yet: the burndown
   * variant work adds the header rendering and consumes this prop.
   */
  burndownVariant?: T3TeamDigestBurndownVariant;
}) {
  const ticketsById = new Map(graph.tickets.map((ticket) => [ticket.id, ticket]));
  const lane = { graph, ticketsById, nowMs };
  if (plan.sections.length === 0) {
    return (
      <T3SurfacePanel
        tone="dashed"
        className="px-6 py-10 text-center text-sm text-muted-foreground"
      >
        Nothing needs you
      </T3SurfacePanel>
    );
  }
  const side = plan.sections.filter((s) => s.placement === "side");
  const main = plan.sections.filter((s) => s.placement === "main");
  const footer = plan.sections.filter((s) => s.placement === "footer");
  return (
    <div className="space-y-8">
      <div className="grid gap-x-6 gap-y-8 sm:gap-x-10 xl:grid-cols-[minmax(16rem,2fr)_minmax(0,5fr)]">
        <div className="space-y-8">
          {side.map((s) => (
            <SideSection key={s.id} section={s} {...lane} />
          ))}
        </div>
        <div className="space-y-8">
          {main.map((s) => (
            <MainSection key={s.id} section={s} {...lane} />
          ))}
        </div>
      </div>
      {footer.length > 0 ? (
        <div className="grid gap-x-6 gap-y-6 border-t border-border/70 pt-6 sm:gap-x-10 md:grid-cols-2 xl:grid-cols-3">
          {footer.map((s) => (
            <FooterSection key={s.id} section={s} {...lane} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
