import { useMemo } from "react";

import type { EnvironmentSetupProfile } from "@t3tools/contracts";
import type { T3TeamProfile } from "@t3tools/t3team-skill-packs";

import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { T3TeamCloneProjectSetupProfileDialog } from "~/t3team/t3team-CloneProjectSetupProfileDialog";
import { listT3TeamProjectSetupCardOptions } from "~/t3team/t3team-projectSetupProfileCatalog";
import type { T3TeamProjectSetupProfileId } from "~/t3team/t3team-projectSetup";

type ProfileOption = {
  readonly value: string;
  readonly label: string;
  readonly description: string;
};

/** The built-in or pack profiles, plus the cloned one when the user made one. */
export function buildProfileOptions(
  packProfiles: readonly EnvironmentSetupProfile[] | undefined,
  customProfile: T3TeamProfile | undefined,
): ReadonlyArray<ProfileOption> {
  const options = listT3TeamProjectSetupCardOptions(packProfiles).map((option) => ({
    value: option.id,
    label: option.title,
    description: option.description,
  }));
  if (!customProfile || options.some((option) => option.value === customProfile.id)) {
    return options;
  }
  return [
    ...options,
    {
      value: customProfile.id,
      label: customProfile.title,
      description: "Your cloned profile, saved with the project.",
    },
  ];
}

/**
 * How the agents should work with the user on this project. One dense row — the choice is
 * almost always the stored default — with the chosen profile's one-line description beneath.
 */
export function CreateProjectProfileSection({
  profileId,
  customProfile,
  packProfiles,
  disabled,
  onProfileChange,
  onCustomProfileChange,
}: {
  profileId: T3TeamProjectSetupProfileId;
  customProfile: T3TeamProfile | undefined;
  packProfiles: readonly EnvironmentSetupProfile[] | undefined;
  disabled?: boolean;
  onProfileChange: (profileId: T3TeamProjectSetupProfileId) => void;
  onCustomProfileChange: (profile: T3TeamProfile | undefined) => void;
}) {
  const options = useMemo(
    () => buildProfileOptions(packProfiles, customProfile),
    [customProfile, packProfiles],
  );
  const selected = options.find((option) => option.value === profileId) ?? options[0];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">Working style</div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{selected?.description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1 max-sm:w-full">
        <Select
          items={options.map(({ value, label }) => ({ value, label }))}
          value={selected?.value ?? profileId}
          disabled={disabled}
          onValueChange={(value) => {
            if (!value) return;
            if (value !== customProfile?.id) onCustomProfileChange(undefined);
            onProfileChange(value);
          }}
        >
          <SelectTrigger size="sm" className="w-52 max-sm:flex-1" aria-label="Working style">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <T3TeamCloneProjectSetupProfileDialog
          sourceProfileId={profileId}
          onClone={(profile) => {
            onCustomProfileChange(profile);
            onProfileChange(profile.id);
          }}
        />
      </div>
    </div>
  );
}
