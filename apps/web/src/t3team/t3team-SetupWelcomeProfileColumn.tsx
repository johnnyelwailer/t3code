import type { EnvironmentSetupProfile } from "@t3tools/contracts";

import { BadgeCheck } from "lucide-react";

import {
  listT3TeamProjectSetupCardOptions,
  T3TeamProjectSetupProfileCards,
} from "~/t3team/t3team-ProjectSetupProfileCards";
import {
  useT3TeamProjectSetupProfile,
  writeT3TeamProjectSetupProfile,
} from "~/t3team/t3team-projectSetupProfile";

/**
 * The work profile chooser column of the first-run setup surface. Rendered only while the
 * `WORK_PROFILE_CHOOSER` flag is on — see `t3team-workProfileChooser.ts` — so the surface can
 * drop the whole column (and collapse to a single column) without carrying its state.
 */
export function T3TeamSetupWelcomeProfileColumn({
  packProfiles,
}: {
  packProfiles: readonly EnvironmentSetupProfile[] | undefined;
}) {
  const setupProfileId = useT3TeamProjectSetupProfile();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Who are you, and how do you want to work?
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Choose a style that matches your day-to-day work. You can change it later in Settings or
          before creating a project.
        </p>
      </div>

      <T3TeamProjectSetupProfileCards
        selectedProfileId={setupProfileId}
        onSelectProfile={writeT3TeamProjectSetupProfile}
        profiles={packProfiles}
      />
    </div>
  );
}

/** "Selected profile: …" chip beside the primary action. Chooser-only, for the same reason. */
export function T3TeamSetupWelcomeProfileChip({
  packProfiles,
}: {
  packProfiles: readonly EnvironmentSetupProfile[] | undefined;
}) {
  const setupProfileId = useT3TeamProjectSetupProfile();
  const cardOptions = listT3TeamProjectSetupCardOptions(packProfiles);
  // Never label the chip with a profile that is not in the rendered catalog.
  const selectedProfile =
    cardOptions.find((option) => option.id === setupProfileId) ?? cardOptions[0];

  return (
    <div className="inline-flex min-w-0 items-center gap-2 rounded-full bg-background/75 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
      <BadgeCheck className="size-3.5 text-success" />
      Selected profile: {selectedProfile?.title ?? "Project Partner"}
    </div>
  );
}
