import type { T3TeamProfile } from "@t3tools/t3team-skill-packs";

import { T3TeamCloneProjectSetupProfileDialog } from "~/t3team/t3team-CloneProjectSetupProfileDialog";
import { T3TeamProjectSetupProfileCards } from "~/t3team/t3team-ProjectSetupProfileCards";
import { useT3TeamPackSetupProfiles } from "~/t3team/t3team-packSetupProfiles";
import type { T3TeamProjectSetupProfileId } from "~/t3team/t3team-projectSetup";

/**
 * Its own step now — previously one of five things crammed onto a single overloaded "confirm"
 * step. A profile is always preselected (see `useT3TeamProjectSetupProfile`), so Continue works
 * immediately without forcing a choice here.
 */
export function ProfileStep({
  setupProfileId,
  onSetupProfileChange,
  customProfile,
  onCustomProfileChange,
}: {
  setupProfileId: T3TeamProjectSetupProfileId;
  onSetupProfileChange: (profileId: T3TeamProjectSetupProfileId) => void;
  customProfile?: T3TeamProfile | undefined;
  onCustomProfileChange: (profile: T3TeamProfile | undefined) => void;
}) {
  const packProfiles = useT3TeamPackSetupProfiles();

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">How should t3team work with you?</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick the working style agents should default to for this project.
          </p>
        </div>
        <T3TeamCloneProjectSetupProfileDialog
          sourceProfileId={setupProfileId}
          onClone={(profile) => {
            onCustomProfileChange(profile);
            onSetupProfileChange(profile.id);
          }}
        />
      </div>

      <T3TeamProjectSetupProfileCards
        compact
        selectedProfileId={setupProfileId}
        onSelectProfile={(profileId) => {
          onCustomProfileChange(undefined);
          onSetupProfileChange(profileId);
        }}
        profiles={packProfiles}
      />
    </section>
  );
}
