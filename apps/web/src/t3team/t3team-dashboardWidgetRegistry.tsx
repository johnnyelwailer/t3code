/**
 * The shell components behind the bundled `dashboard.widget` definitions
 * (`@t3tools/t3team-skill-packs` `BUNDLED_DASHBOARD_WIDGETS`), keyed by their `component`, the same
 * stage-1 binding `t3team-sidecarSectionRegistry.tsx` uses. A digest section names a widget id; the
 * view resolves it here, so an arrangement — heuristic or agent-made — only ever places widgets.
 */
import { bundledDashboardWidget } from "@t3tools/t3team-skill-packs";
import type { DashboardWidgetPlacement } from "@t3team/sdk/placements";
import type { ReactNode } from "react";

import { DigestYesterdayWidget } from "~/t3team/t3team-ProjectMyWorkDigestYesterday";
import { DigestReviewSection } from "~/t3team/t3team-ProjectMyWorkDigestReviewSection";
import {
  FooterSection,
  MainSection,
  SideSection,
  type LaneProps,
} from "~/t3team/t3team-ProjectMyWorkDigestSections";
import type { DigestSection } from "~/t3team/t3team-projectMyWorkDigestPlan";

type DashboardWidgetProps = LaneProps & {
  readonly section: DigestSection;
  readonly placement: DashboardWidgetPlacement;
};

/** Tickets: a compact list beside the main lane, story groups in it, a count in the footer. */
function DigestTicketsWidget({ placement, ...props }: DashboardWidgetProps) {
  if (placement === "side") return <SideSection {...props} />;
  if (placement === "footer") return <FooterSection {...props} />;
  return <MainSection {...props} />;
}

const DASHBOARD_WIDGET_COMPONENTS: Record<string, (props: DashboardWidgetProps) => ReactNode> = {
  "digest-tickets": DigestTicketsWidget,
  "digest-reviews": ({ placement: _placement, ...props }) => <DigestReviewSection {...props} />,
  // Reads the graph itself; the compact list is the same in the side lane and the footer.
  "digest-yesterday": ({ placement: _placement, ...props }) => <DigestYesterdayWidget {...props} />,
};

/** The widget a section names, or the default for what it lists (`items` → tickets). */
export function digestSectionWidgetId(section: DigestSection): string {
  return section.widget ?? (section.kind === "reviews" ? "my-work.reviews" : "my-work.tickets");
}

/**
 * One placed widget. A widget id the shell does not know, or a placement its definition does not
 * allow, renders nothing — an arrangement is data and must not be able to break the view.
 */
export function DashboardWidget(props: DashboardWidgetProps) {
  const definition = bundledDashboardWidget(digestSectionWidgetId(props.section));
  if (definition === undefined || !definition.placements.includes(props.placement)) return null;
  const Component = DASHBOARD_WIDGET_COMPONENTS[definition.component];
  return Component ? <Component {...props} /> : null;
}
