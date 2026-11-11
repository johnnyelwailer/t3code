import { useState } from "react";
import type { EnvironmentSetupProfile } from "@t3tools/contracts";

import { T3TeamRichChoice } from "~/t3team/rich-choice/t3team-RichChoice";
import type { RichChoiceOption } from "~/t3team/rich-choice/t3team-richChoice.logic";

export function profilesToRoleOptions(
  profiles: readonly EnvironmentSetupProfile[],
): readonly RichChoiceOption[] {
  return profiles.map((profile) => ({
    id: profile.id,
    title: profile.title,
    tag: profile.badge,
    body: profile.description,
    chips: profile.bullets.slice(0, 2),
  }));
}

export function NexiWelcomeRoleSection({
  profiles,
  selectedId,
  onChoose,
}: {
  readonly profiles: readonly EnvironmentSetupProfile[];
  readonly selectedId: string | null;
  readonly onChoose: (profileId: string) => void;
}) {
  const [last, setLast] = useState<string | null>(selectedId);
  const options = profilesToRoleOptions(profiles);
  if (options.length === 0) return null;
  return (
    <div className="py-1">
      <T3TeamRichChoice
        prompt="Choose your role"
        options={options}
        selectedIds={last ? [last] : []}
        onChoose={([id]) => {
          const next = id ?? null;
          setLast(next);
          if (next) onChoose(next);
        }}
      />
    </div>
  );
}
