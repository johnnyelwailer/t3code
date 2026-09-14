import { useState } from "react";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { DigestItemRow, DigestKicker, DigestProjectChip } from "~/t3team/t3team-ProjectMyWorkDigestRows";
import type { DigestGraph, DigestSection, ResolvedDigestPlan } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { buildProjectTicketHierarchy } from "~/t3team/t3team-ticketHierarchy";
import type { ProjectTicket } from "~/t3team/t3team-types";

type LaneProps = {
  graph: DigestGraph;
  ticketsById: ReadonlyMap<string, ProjectTicket>;
  nowMs: number;
  onOpenTicket: (ticketId: string) => void;
};

function SideSection({ section, graph, ticketsById, nowMs, onOpenTicket }: LaneProps & { section: DigestSection }) {
  return (
    <section className="space-y-2">
      <DigestKicker count={section.items.length}>{section.heading}</DigestKicker>
      {section.hint ? <p className="text-[11.5px] text-muted-foreground">{section.hint}</p> : null}
      <T3SurfacePanel tone={section.id.includes("needs-you") ? "default" : "muted"} className="divide-y divide-border/60">
        {section.items.map((item) => {
          const ticket = ticketsById.get(item.ticketId);
          return ticket ? (
            <DigestItemRow key={ticket.id} ticket={ticket} why={item.why} graph={graph} nowMs={nowMs} onOpen={() => onOpenTicket(ticket.id)} />
          ) : null;
        })}
      </T3SurfacePanel>
    </section>
  );
}

function groupByParent(section: DigestSection, graph: DigestGraph, ticketsById: ReadonlyMap<string, ProjectTicket>) {
  const hierarchy = buildProjectTicketHierarchy(graph.tickets);
  const groups = new Map<string | null, { parent: ProjectTicket | null; items: typeof section.items }>();
  for (const item of section.items) {
    const parentId = hierarchy.parentByChildId.get(item.ticketId) ?? null;
    const parent = parentId ? (ticketsById.get(parentId) ?? null) : null;
    const key = parent?.id ?? null;
    const group = groups.get(key) ?? { parent, items: [] };
    groups.set(key, { parent, items: [...group.items, item] });
  }
  return [...groups.values()];
}

function MainSection({ section, graph, ticketsById, nowMs, onOpenTicket }: LaneProps & { section: DigestSection }) {
  let index = 0;
  return (
    <section className="space-y-2">
      <DigestKicker count={section.items.length}>{section.heading}</DigestKicker>
      {section.hint ? <p className="text-[11.5px] text-muted-foreground">{section.hint}</p> : null}
      <div className="space-y-3">
        {groupByParent(section, graph, ticketsById).map((group) => (
          <T3SurfacePanel key={group.parent?.id ?? "none"} tone="muted" className="overflow-hidden">
            {group.parent ? (
              <div className="flex items-baseline gap-2 border-b border-border/60 bg-muted/40 px-3 py-1.5 text-[12px]">
                <span className="font-mono text-[11px] text-muted-foreground">{group.parent.ref.displayId}</span>
                <span className="truncate font-medium">{group.parent.ref.title}</span>
                <DigestProjectChip graph={graph} projectId={group.parent.projectId} />
                <span className="ml-auto text-[11px] text-muted-foreground">{group.items.length} {group.items.length === 1 ? "item" : "items"}</span>
              </div>
            ) : null}
            <div className="divide-y divide-border/50">
              {group.items.map((item) => {
                const ticket = ticketsById.get(item.ticketId);
                if (!ticket) return null;
                index += 1;
                return (
                  <DigestItemRow key={ticket.id} ticket={ticket} index={index} why={item.why} graph={graph} nowMs={nowMs} onOpen={() => onOpenTicket(ticket.id)} />
                );
              })}
            </div>
          </T3SurfacePanel>
        ))}
      </div>
    </section>
  );
}

function FooterSection({ section, graph, ticketsById, nowMs, onOpenTicket }: LaneProps & { section: DigestSection }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-2">
      <DigestKicker count={section.items.length}>{section.heading}</DigestKicker>
      <T3SurfacePanel tone="muted" className="divide-y divide-border/60">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-[12.5px]">
          <span className="text-xl font-semibold tabular-nums">{section.items.length}</span>
          <span className="text-muted-foreground">{section.hint ?? "nothing needed from you"}</span>
          <span className="ml-auto text-[11px] text-muted-foreground">{open ? "Hide" : "Show"}</span>
        </button>
        {open
          ? section.items.map((item) => {
              const ticket = ticketsById.get(item.ticketId);
              return ticket ? (
                <DigestItemRow key={ticket.id} ticket={ticket} why={item.why} graph={graph} nowMs={nowMs} onOpen={() => onOpenTicket(ticket.id)} />
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
  onOpenTicket,
}: {
  plan: ResolvedDigestPlan;
  graph: DigestGraph;
  nowMs: number;
  onOpenTicket: (ticketId: string) => void;
}) {
  const ticketsById = new Map(graph.tickets.map((ticket) => [ticket.id, ticket]));
  const lane = { graph, ticketsById, nowMs, onOpenTicket };
  if (plan.sections.length === 0) {
    return (
      <T3SurfacePanel tone="dashed" className="px-6 py-10 text-center text-sm text-muted-foreground">Nothing needs you</T3SurfacePanel>
    );
  }
  const side = plan.sections.filter((s) => s.placement === "side");
  const main = plan.sections.filter((s) => s.placement === "main");
  const footer = plan.sections.filter((s) => s.placement === "footer");
  return (
    <div className="space-y-8">
      <div className="grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(20rem,2fr)_minmax(0,5fr)]">
        <div className="space-y-8">{side.map((s) => <SideSection key={s.id} section={s} {...lane} />)}</div>
        <div className="space-y-8">{main.map((s) => <MainSection key={s.id} section={s} {...lane} />)}</div>
      </div>
      {footer.length > 0 ? (
        <div className="grid gap-x-10 gap-y-6 border-t border-border/70 pt-6 md:grid-cols-2 xl:grid-cols-3">
          {footer.map((s) => <FooterSection key={s.id} section={s} {...lane} />)}
        </div>
      ) : null}
    </div>
  );
}
