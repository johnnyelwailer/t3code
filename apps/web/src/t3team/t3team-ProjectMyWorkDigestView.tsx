import { digestLaneLayout } from "~/t3team/t3team-projectMyWorkDigestLaneLayout";
import { digestShownTicketIds } from "~/t3team/t3team-projectMyWorkDigestGroups";
import { DigestReviewSection } from "~/t3team/t3team-ProjectMyWorkDigestReviewSection";
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
  updatedAtMs,
}: {
  plan: ResolvedDigestPlan;
  graph: DigestGraph;
  nowMs: number;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
  burndownVariant?: DigestBurndownVariant;
  updatedAtMs?: number;
}) {
  const ticketsById = new Map(graph.tickets.map((ticket) => [ticket.id, ticket]));
  const lane = { graph, ticketsById, nowMs, onOpenTicket };
  const header = (
    <ProjectMyWorkDigestHeader
      graph={graph}
      nowMs={nowMs}
      burndownVariant={burndownVariant}
      {...(updatedAtMs !== undefined ? { updatedAtMs } : {})}
    />
  );
  if (plan.sections.length === 0) {
    return (
      <div className="@container/digest space-y-8">
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
  // blank band between the header and the footer. Width is the parent's job: the digest lens
  // drops the centered max-width cap so a widescreen uses the whole pane.
  const lanesEmpty = side.length === 0 && main.length === 0;
  // A lone footer section spans the row; the 2/3-column split only applies once there is more than
  // one, so a single "Parked" card never gets squeezed into a third of the width.
  const footerColumns =
    footer.length >= 3
      ? "@3xl/digest:grid-cols-2 @6xl/digest:grid-cols-3"
      : footer.length === 2
        ? "@3xl/digest:grid-cols-2"
        : "";
  const lanes = digestLaneLayout({ side: side.length, main: main.length });
  const shownTicketIds = digestShownTicketIds([...side, ...main], graph);
  return (
    <div className="@container/digest space-y-8">
      {header}
      {lanesEmpty ? (
        <T3SurfacePanel
          tone="dashed"
          className="px-6 py-6 text-center text-sm text-muted-foreground"
        >
          Nothing needs you right now
        </T3SurfacePanel>
      ) : (
        <div className={lanes.gridClassName}>
          {lanes.showSide ? (
            <div className="min-w-0 space-y-8">
              {side.map((s) =>
                s.kind === "reviews" ? (
                  <DigestReviewSection key={s.id} section={s} {...lane} />
                ) : (
                  <SideSection key={s.id} section={s} {...lane} />
                ),
              )}
            </div>
          ) : null}
          {lanes.showMain ? (
            <div className="@container/lane min-w-0 space-y-8">
              {main.map((s) => (
                <MainSection key={s.id} section={s} {...lane} shownTicketIds={shownTicketIds} />
              ))}
            </div>
          ) : null}
        </div>
      )}
      {footer.length > 0 ? (
        <div
          className={`grid grid-cols-1 gap-x-6 gap-y-6 border-t border-border/70 pt-6 @xl/digest:gap-x-10 ${footerColumns}`}
        >
          {footer.map((s) => (
            <FooterSection key={s.id} section={s} {...lane} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
