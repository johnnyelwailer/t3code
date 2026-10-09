/**
 * The `dashboard.widget` slot. The shell components behind the bundled definitions
 * (`@t3tools/t3team-skill-packs` `BUNDLED_DASHBOARD_WIDGETS`) are registered into the app's view
 * registry as host views, next to the widgets packs register with their own definition. A digest
 * section names a widget id; the view resolves it there, so an arrangement — heuristic or
 * agent-made — only ever places widgets.
 */
import { BUNDLED_DASHBOARD_WIDGETS } from "@t3tools/t3team-skill-packs";
import type { DashboardWidgetPlacement } from "@t3team/sdk/placements";
import type { ReactNode } from "react";

import { appViewRegistry } from "~/t3team/packs/t3team-appViewRegistry";
import { ViewInstance } from "~/t3team/packs/t3team-ViewInstance";
import type { DashboardWidgetEntry } from "~/t3team/packs/t3team-viewRegistry";

import { DigestYesterdayWidget } from "~/t3team/t3team-ProjectMyWorkDigestYesterday";
import { DigestReviewSection } from "~/t3team/t3team-ProjectMyWorkDigestReviewSection";
import {
  FooterSection,
  MainSection,
  SideSection,
  type LaneProps,
} from "~/t3team/t3team-ProjectMyWorkDigestSections";
import type { DigestSection } from "~/t3team/t3team-projectMyWorkDigestPlan";

export type DashboardWidgetProps = LaneProps & {
  readonly section: DigestSection;
  readonly placement: DashboardWidgetPlacement;
};

/** Tickets: a compact list beside the main lane, story groups in it, a count in the footer. */
function DigestTicketsWidget({ placement, ...props }: DashboardWidgetProps) {
  if (placement === "side") return <SideSection {...props} />;
  if (placement === "footer") return <FooterSection {...props} />;
  return <MainSection {...props} />;
}

/** Keyed by a bundled definition's `component`; read lazily, see `t3team-appViewRegistry.ts`. */
const BUNDLED_WIDGET_COMPONENTS: Record<string, (props: DashboardWidgetProps) => ReactNode> = {
  "digest-tickets": DigestTicketsWidget,
  "digest-reviews": ({ placement: _placement, ...props }) => <DigestReviewSection {...props} />,
  // Reads the graph itself; the compact list is the same in the side lane and the footer.
  "digest-yesterday": ({ placement: _placement, ...props }) => <DigestYesterdayWidget {...props} />,
};

/** The widget a section names, or the default for what it lists (`items` → tickets). */
export function digestSectionWidgetId(section: DigestSection): string {
  return section.widget ?? (section.kind === "reviews" ? "my-work.reviews" : "my-work.tickets");
}

/** The bundled widgets as host views of the `dashboard.widget` slot. */
export function hostDashboardWidgetViews(): ReadonlyArray<DashboardWidgetEntry> {
  return BUNDLED_DASHBOARD_WIDGETS.flatMap((definition) => {
    const component = BUNDLED_WIDGET_COMPONENTS[definition.component];
    return component
      ? [
          {
            slot: "dashboard.widget" as const,
            id: definition.id,
            owner: { kind: "host" as const },
            definition,
            component,
          },
        ]
      : [];
  });
}

/**
 * One placed widget, in its own error boundary. A widget id nobody registered, or a placement its
 * definition does not allow, renders nothing — an arrangement is data and must not be able to
 * break the view.
 */
export function DashboardWidget(props: DashboardWidgetProps) {
  const widgetId = digestSectionWidgetId(props.section);
  const entry = appViewRegistry().get("dashboard.widget", widgetId);
  if (entry === undefined || !entry.definition.placements.includes(props.placement)) return null;
  return (
    <ViewInstance owner={entry.owner} resetKeys={[widgetId, props.placement]} fallback={null}>
      <entry.component {...props} />
    </ViewInstance>
  );
}
