import { ArrowRight, Sparkles } from "lucide-react";

import type { EnvironmentSetupProfile } from "@t3tools/contracts";

import { Button } from "~/t3team/components/ui/t3team-button";
import { T3TeamPackBrandImage } from "~/t3team/t3team-PackBrandImage";
import { useT3TeamPackAppearance } from "~/t3team/t3team-packAppearance";
import { useT3TeamPackSetupProfiles } from "~/t3team/t3team-packSetupProfiles";
import {
  T3TeamSetupWelcomeProfileChip,
  T3TeamSetupWelcomeProfileColumn,
} from "~/t3team/t3team-SetupWelcomeProfileColumn";
import { T3TeamSetupWelcomeSteps } from "~/t3team/t3team-SetupWelcomeSteps";
import {
  T3TEAM_FIRST_PROJECT_SETUP_REASON,
  type T3TeamSetupSurfaceReason,
} from "~/t3team/t3team-setupSurfaceReason";
import { useT3TeamWorkProfileChooserEnabled } from "~/t3team/t3team-workProfileChooser";

export function T3TeamSetupWelcomeSurface({
  onCreate,
  profilesOverride,
  reason = T3TEAM_FIRST_PROJECT_SETUP_REASON,
}: {
  onCreate: () => void;
  /** Storybook/preview escape hatch to supply pack profiles without a live server. */
  profilesOverride?: readonly EnvironmentSetupProfile[] | undefined;
  /** Why this surface is showing — first-run setup vs. an existing project with no work source. */
  reason?: T3TeamSetupSurfaceReason;
}) {
  const appearance = useT3TeamPackAppearance();
  const productName = appearance?.labels?.appName ?? "t3team";
  const livePackProfiles = useT3TeamPackSetupProfiles();
  const packProfiles = profilesOverride ?? livePackProfiles;
  // Runtime feature flag (default off): with no chooser the right column, the selected-profile
  // chip and the "pick your style" step all go away, and the copy stops promising a choice.
  const chooserEnabled = useT3TeamWorkProfileChooserEnabled();

  const chipLabel =
    reason.kind === "no-work-project" ? "No work source connected yet" : "First project setup";
  // The heading stays an invitation in both cases. A local workspace is a
  // legitimate place to be, not a defective project — so the "why you landed
  // here" detail belongs in the muted subline, named as a workspace, never
  // shouted as the page title.
  const headingText = `Bring your Jira work into ${productName} in a few clicks.`;
  const sublineText =
    reason.kind === "no-work-project"
      ? reason.projectTitle
        ? `My work shows tickets and backlog from a connected Jira project. “${reason.projectTitle}” is a local workspace and keeps working as one — connecting a Jira project here adds the work views alongside it.`
        : `My work shows tickets and backlog from a connected Jira project. Your local workspaces keep working as they are — connecting a Jira project adds the work views alongside them.`
      : chooserEnabled
        ? `Pick how you want ${productName} to communicate, connect a Jira project, and start from a workspace that feels ready out of the box.`
        : `Connect a Jira project and start from a workspace that feels ready out of the box.`;

  // `align-items: safe center` rather than `items-center`: once the card is taller
  // than the viewport, plain centering overflows the *start* edge, and that overflow
  // is unreachable because scrollTop is already 0 — the heading gets clipped with no
  // way to scroll up to it. `safe` falls back to flex-start exactly in that case.
  return (
    <div className="relative flex flex-1 [align-items:safe_center] justify-center overflow-auto p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-52 t3team-welcome-glow opacity-80" />
      <div className="pointer-events-none absolute inset-0 t3team-welcome-wash" />

      <section
        className={`relative mx-auto w-full overflow-hidden rounded-4xl border border-border/70 bg-card/85 p-4 shadow-2xl shadow-black/10 backdrop-blur sm:p-6 xl:p-8 ${chooserEnabled ? "max-w-6xl" : "max-w-3xl"}`}
      >
        <div className="pointer-events-none absolute -left-10 top-14 size-40 rounded-full bg-info/20 blur-3xl motion-safe:animate-pulse" />
        <div
          className="pointer-events-none absolute right-0 top-0 size-52 rounded-full bg-warning/20 blur-3xl motion-safe:animate-pulse"
          style={{ animationDelay: "900ms" }}
        />

        <div
          className="relative grid items-start gap-8"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))" }}
        >
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-foreground/80 shadow-sm backdrop-blur-sm">
              <Sparkles className="size-3.5 text-info" />
              {chipLabel}
            </div>

            <div className="max-w-2xl space-y-3">
              <T3TeamPackBrandImage
                brand={appearance?.brand}
                kind="wordmark"
                alt={productName}
                className="h-6 w-auto"
              />
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {headingText}
              </h1>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                {sublineText}
              </p>
            </div>

            <T3TeamSetupWelcomeSteps includeProfileStep={chooserEnabled} />

            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button className="w-full sm:w-auto" onClick={onCreate}>
                Set up first project
                <ArrowRight className="size-4" />
              </Button>
              {chooserEnabled ? (
                <T3TeamSetupWelcomeProfileChip packProfiles={packProfiles} />
              ) : null}
            </div>
          </div>

          {chooserEnabled ? <T3TeamSetupWelcomeProfileColumn packProfiles={packProfiles} /> : null}
        </div>
      </section>
    </div>
  );
}
