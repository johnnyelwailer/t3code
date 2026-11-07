import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import {
  ComposerBannerStack,
  type ComposerBannerStackItem,
} from "~/components/chat/ComposerBannerStack";
import { BANNER_DISMISSAL_TTL_MS } from "~/components/chat/t3team-ResourcePressureThreadBanner.logic";
import { Button } from "~/components/ui/button";

/**
 * Dismissible memory-pressure banner: the composer's environment-group item shown while the
 * server sample is warn/critical. Carries "Clean up resources…" (opens an agent thread with
 * the protection brief) and a native X that hides it for a persisted per-thread window.
 */
function ResourcePressureBannerStory() {
  const [dismissed, setDismissed] = useState(false);
  const dismissMinutes = Math.round(BANNER_DISMISSAL_TTL_MS / 60_000);
  if (dismissed) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 bg-background p-8">
        <p className="rounded-lg border border-border/70 bg-card p-4 text-sm text-muted-foreground">
          Banner dismissed for {dismissMinutes} minutes (persisted per thread). It stays hidden for
          the whole window and re-surfaces only after it, for the next pressure episode.
        </p>
      </div>
    );
  }
  const item: ComposerBannerStackItem = {
    id: "resource-pressure",
    variant: "warning",
    group: "environment",
    icon: <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />,
    title: "Memory pressure critical",
    actions: (
      // Story-only no-op: in the app this opens a visible agent thread with the protection brief.
      <Button size="xs" variant="ghost">
        Clean up resources…
      </Button>
    ),
    dismissLabel: "Dismiss memory-pressure notice",
    onDismiss: () => setDismissed(true),
  };
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-end gap-4 bg-background p-8">
      <p className="text-sm text-muted-foreground">
        Dismissible for {dismissMinutes} minutes per thread; the X below hides it for that window.
      </p>
      <ComposerBannerStack detached items={[item]} />
    </div>
  );
}

const meta = {
  title: "T3Team/Chat/Memory Pressure Banner (GHE #956)",
  component: ResourcePressureBannerStory,
} satisfies Meta<typeof ResourcePressureBannerStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Critical pressure: the dismissible banner with the agent cleanup action and the X. */
export const DismissibleCritical: Story = {};
