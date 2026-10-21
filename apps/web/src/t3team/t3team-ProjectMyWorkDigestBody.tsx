import { DigestJiraNoticeCard } from "~/t3team/t3team-DigestJiraNoticeCard";
import { resolveDigestJiraNotice } from "~/t3team/t3team-digestJiraNotice";
import { resolveDigestEmptyLanes } from "~/t3team/t3team-myWorkDigestRenderState";
import { digestLaneLayout } from "~/t3team/t3team-projectMyWorkDigestLaneLayout";
import {
  digestRowTicketIds,
  digestShownTicketIds,
} from "~/t3team/t3team-projectMyWorkDigestGroups";
import { DashboardWidget } from "~/t3team/t3team-dashboardWidgetRegistry";
import { MyWorkLoadingLanesPlaceholder } from "~/t3team/t3team-MyWorkLoadingAnimation";
import { DigestArrangementBar } from "~/t3team/t3team-ProjectMyWorkDigestArrangementBar";
import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { T3TeamCompanionSlot, useJustCleared } from "~/t3team/packs/t3team-CompanionSlot";
import {
  ProjectMyWorkDigestHeader,
  type DigestBurndownVariant,
} from "~/t3team/t3team-ProjectMyWorkDigestHeader";
import type { DigestGraph, ResolvedDigestPlan } from "~/t3team/t3team-projectMyWorkDigestPlan";

/**
 * A lone footer section spans the row; the 2/3-column split only applies once there is more than
 * one, so a single "Parked" card never gets squeezed into a third of the width.
 */
/** A pack's companion above "Nothing needs you"; nothing at all without one. */
function DigestEmptyCompanion({ cleared }: { cleared: boolean }) {
  return (
    <T3TeamCompanionSlot
      placement="myWork.empty"
      mood={cleared ? "cleared" : "empty"}
      size="md"
      className="mx-auto mb-3 flex justify-center"
    />
  );
}

function footerGridColumns(count: number): string {
  if (count >= 3) return "@3xl/digest:grid-cols-2 @6xl/digest:grid-cols-3";
  return count === 2 ? "@3xl/digest:grid-cols-2" : "";
}

/** The digest as it is on screen right now; `ProjectMyWorkDigestView` decides what that is. */
export function ProjectMyWorkDigestBody({
  plan,
  graph,
  nowMs,
  onOpenTicket,
  burndownVariant = "off",
  updatedAtMs,
  onResetArrangement,
  refreshing = false,
  emptyStateAllowed = true,
  onReload,
}: {
  plan: ResolvedDigestPlan;
  graph: DigestGraph;
  nowMs: number;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
  burndownVariant?: DigestBurndownVariant;
  updatedAtMs?: number;
  onResetArrangement?: (() => Promise<void>) | undefined;
  refreshing?: boolean;
  emptyStateAllowed?: boolean;
  onReload?: (() => void) | undefined;
}) {
  const ticketsById = new Map(graph.tickets.map((ticket) => [ticket.id, ticket]));
  const lane = { graph, ticketsById, nowMs, onOpenTicket };
  const header = (
    <ProjectMyWorkDigestHeader
      graph={graph}
      nowMs={nowMs}
      burndownVariant={burndownVariant}
      refreshing={refreshing}
      {...(updatedAtMs !== undefined ? { updatedAtMs } : {})}
    />
  );
  const jiraNotice = resolveDigestJiraNotice(graph, nowMs);
  const noticeCard = jiraNotice ? (
    <DigestJiraNoticeCard notice={jiraNotice} onReload={onReload} />
  ) : null;
  const emptyLanes = resolveDigestEmptyLanes({
    emptyStateAllowed,
    jiraNoticeShown: jiraNotice !== null,
    jiraSyncPending: graph.jiraSyncPending === true,
  });
  // The companion says `cleared` for a while when the lanes' last item went away on screen (not
  // when they were empty from the first answer).
  const justCleared = useJustCleared(plan.sections.every((s) => s.placement === "footer"));
  const arranged = graph.arrangement ? (
    <DigestArrangementBar
      arrangement={graph.arrangement}
      nowMs={nowMs}
      onReset={onResetArrangement}
    />
  ) : null;
  if (plan.sections.length === 0) {
    return (
      <div className="@container/digest t3team-digest-fade-in space-y-8">
        {header}
        {noticeCard}
        {arranged}
        {emptyLanes === "nothing" ? (
          <T3SurfacePanel
            tone="dashed"
            className="px-6 py-10 text-center text-sm text-muted-foreground"
          >
            <DigestEmptyCompanion cleared={justCleared} />
            Nothing needs you
          </T3SurfacePanel>
        ) : emptyLanes === "loading" ? (
          <MyWorkLoadingLanesPlaceholder />
        ) : null}
      </div>
    );
  }
  const side = plan.sections.filter((s) => s.placement === "side");
  const main = plan.sections.filter((s) => s.placement === "main");
  const footer = plan.sections.filter((s) => s.placement === "footer");
  const onlyParkedWork = side.length === 0 && main.length === 0;
  const footerColumns = footerGridColumns(footer.length);
  const lanes = digestLaneLayout({ side: side.length, main: main.length });
  const shownTicketIds = digestShownTicketIds([...side, ...main], graph);
  const rowTicketIds = digestRowTicketIds([...side, ...main], graph);
  return (
    <div className="@container/digest t3team-digest-fade-in space-y-8">
      {header}
      {noticeCard}
      {arranged}
      {onlyParkedWork ? (
        emptyLanes === "nothing" ? (
          <T3SurfacePanel
            tone="dashed"
            className="px-6 py-6 text-center text-sm text-muted-foreground"
          >
            <DigestEmptyCompanion cleared={justCleared} />
            Nothing needs you right now
          </T3SurfacePanel>
        ) : emptyLanes === "loading" ? (
          <MyWorkLoadingLanesPlaceholder />
        ) : null
      ) : (
        <div className={lanes.gridClassName}>
          {lanes.showSide ? (
            <div className="min-w-0 space-y-8">
              {side.map((s) => (
                <DashboardWidget key={s.id} section={s} placement="side" {...lane} />
              ))}
            </div>
          ) : null}
          {lanes.showMain ? (
            <div className="@container/lane min-w-0 space-y-8">
              {main.map((s) => (
                <DashboardWidget
                  key={s.id}
                  section={s}
                  placement="main"
                  {...lane}
                  shownTicketIds={shownTicketIds}
                  rowTicketIds={rowTicketIds}
                />
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
            <DashboardWidget key={s.id} section={s} placement="footer" {...lane} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
