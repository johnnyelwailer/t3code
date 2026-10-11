/**
 * Fixture pack web modules for the host slots, written as a distribution pack's `web/index.ts`
 * would be: only `@t3team/pack-ui` and `react`. A "ci-insights" pack puts a flaky-test card on a
 * change request's Summary tab and a small badge beside it in My Work; a "broken" pack's summary
 * view throws, to show one crashing view leaves the panel and its neighbours alone.
 *
 * Used by the slot tests and the slot stories; not part of the app.
 */
import {
  Badge,
  defineWebActivate,
  type ChangeRequestSummaryProps,
  type DashboardWidgetViewProps,
  type MyWorkChangeRequestProps,
  type SidecarSectionViewProps,
} from "@t3team/pack-ui";

import type { PackWebActivation } from "./t3team-packWebHost";

function FlakyTestsCard({ changeRequest }: ChangeRequestSummaryProps) {
  return (
    <section
      data-fixture="flaky-tests"
      className="rounded-lg border border-border/70 bg-card px-3 py-2 text-xs"
    >
      <p className="font-medium text-foreground">Flaky tests</p>
      <p className="text-muted-foreground">
        {changeRequest.repository}#{changeRequest.number} · 2 retries on{" "}
        {changeRequest.headSha ?? "head"}
        {changeRequest.viewerAuthored ? " · yours" : ""}
      </p>
    </section>
  );
}

function FlakyBadge({ changeRequest, density }: MyWorkChangeRequestProps) {
  return (
    <span data-fixture="flaky-badge" data-density={density}>
      <Badge size="sm" variant="warning">
        flaky #{changeRequest.number}
      </Badge>
    </span>
  );
}

function BurndownWidget({ section, placement }: DashboardWidgetViewProps) {
  return (
    <p data-fixture="burndown">
      {section.heading} ({placement})
    </p>
  );
}

function NotesSection({ host, props }: SidecarSectionViewProps) {
  return (
    <p data-fixture="notes">
      {host.projectId} {JSON.stringify(props)}
    </p>
  );
}

export const ciInsightsPackWebModule: PackWebActivation = {
  packId: "ci-insights",
  activate: defineWebActivate((context) => {
    context.registerView({
      slot: "changeRequest.summary",
      id: "ci-insights.flaky",
      component: FlakyTestsCard,
    });
    context.registerView({
      slot: "myWork.changeRequest",
      id: "ci-insights.badge",
      component: FlakyBadge,
    });
    context.registerView({
      slot: "dashboard.widget",
      id: "ci-insights.burndown",
      definition: {
        id: "ci-insights.burndown",
        version: "1.0.0",
        title: "Burndown",
        surfaces: ["project.dashboard.myWork"],
        content: "none",
        placements: ["side"],
      },
      component: BurndownWidget,
    });
    context.registerView({
      slot: "sidecar.section",
      id: "ci-insights.notes",
      definition: {
        id: "ci-insights.notes",
        version: "1.0.0",
        title: "CI notes",
        surfaces: ["project.dashboard.myWork"],
      },
      component: NotesSection,
    });
  }),
};

/** A pack whose summary view throws on render, and one that follows it unharmed. */
export const brokenPackWebModule: PackWebActivation = {
  packId: "broken",
  activate: defineWebActivate((context) => {
    context.registerView({
      slot: "changeRequest.summary",
      id: "broken.summary",
      component: () => {
        throw new Error("view bug");
      },
    });
    context.registerView({
      slot: "myWork.changeRequest",
      id: "broken.badge",
      component: () => {
        throw new Error("view bug");
      },
    });
  }),
};
