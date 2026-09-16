import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import {
  FooterSection,
  MainSection,
  SideSection,
} from "~/t3team/t3team-ProjectMyWorkDigestSections";
import {
  ProjectMyWorkDigestHeader,
  type DigestBurndownVariant,
} from "~/t3team/t3team-ProjectMyWorkDigestHeader";
import type { DigestGraph, ResolvedDigestPlan } from "~/t3team/t3team-projectMyWorkDigestPlan";

export function ProjectMyWorkDigestView({
  plan,
  graph,
  nowMs,
  onOpenTicket,
  burndownVariant = "off",
}: {
  plan: ResolvedDigestPlan;
  graph: DigestGraph;
  nowMs: number;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
  burndownVariant?: DigestBurndownVariant;
}) {
  const ticketsById = new Map(graph.tickets.map((ticket) => [ticket.id, ticket]));
  const lane = { graph, ticketsById, nowMs, onOpenTicket };
  const header = (
    <ProjectMyWorkDigestHeader graph={graph} nowMs={nowMs} burndownVariant={burndownVariant} />
  );
  if (plan.sections.length === 0) {
    return (
      <div className="space-y-8">
        {header}
        <T3SurfacePanel
          tone="dashed"
          className="px-6 py-10 text-center text-sm text-muted-foreground"
        >
          Nothing needs you
        </T3SurfacePanel>
      </div>
    );
  }
  const side = plan.sections.filter((s) => s.placement === "side");
  const main = plan.sections.filter((s) => s.placement === "main");
  const footer = plan.sections.filter((s) => s.placement === "footer");
  // Only parked / stalled items: say so in one line instead of leaving the two-lane grid as a
  // blank band between the header and the footer.
  const lanesEmpty = side.length === 0 && main.length === 0;
  // A lone footer section spans the row; the 2/3-column split only applies once there is more than
  // one, so a single "Parked" card never gets squeezed into a third of the width.
  const footerColumns =
    footer.length >= 3
      ? "md:grid-cols-2 xl:grid-cols-3"
      : footer.length === 2
        ? "md:grid-cols-2"
        : "";
  return (
    <div className="space-y-8">
      {header}
      {lanesEmpty ? (
        <T3SurfacePanel
          tone="dashed"
          className="px-6 py-6 text-center text-sm text-muted-foreground"
        >
          Nothing needs you right now
        </T3SurfacePanel>
      ) : (
        <div className="grid gap-x-6 gap-y-8 sm:gap-x-10 xl:grid-cols-[minmax(16rem,2fr)_minmax(0,5fr)]">
          <div className="min-w-0 space-y-8">
            {side.map((s) => (
              <SideSection key={s.id} section={s} {...lane} />
            ))}
          </div>
          <div className="min-w-0 space-y-8">
            {main.map((s) => (
              <MainSection key={s.id} section={s} {...lane} />
            ))}
          </div>
        </div>
      )}
      {footer.length > 0 ? (
        <div
          className={`grid gap-x-6 gap-y-6 border-t border-border/70 pt-6 sm:gap-x-10 ${footerColumns}`}
        >
          {footer.map((s) => (
            <FooterSection key={s.id} section={s} {...lane} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
