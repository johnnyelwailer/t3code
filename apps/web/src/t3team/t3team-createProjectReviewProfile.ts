import type { EnvironmentSetupProfile } from "@t3tools/contracts";
import type { T3TeamProfile } from "@t3tools/t3team-skill-packs";

import { listT3TeamProjectSetupCardOptions } from "~/t3team/t3team-ProjectSetupProfileCards";
import type { T3TeamProjectSetupProfileId } from "~/t3team/t3team-projectSetup";

export type ReviewSetupProfileSummary = {
  readonly title: string;
  readonly description: string | undefined;
};

/**
 * Names the setup profile for the review step — the single most important thing the old review
 * step omitted entirely.
 *
 * `customProfile` (a cloned profile, see `t3team-CloneProjectSetupProfileDialog.tsx`) is
 * authoritative when present: its id is user-chosen and never matches the catalog, so a catalog
 * lookup alone would silently fall back to a generic name for every cloned profile. Absent a
 * custom profile this matches `CreatingStep`'s own lookup
 * (`listT3TeamProjectSetupCardOptions` in `t3team-CreateProjectDialogConfirmStep.tsx`) so a
 * pack-contributed profile still resolves to its real title instead of the same fallback.
 */
export function resolveReviewSetupProfileSummary(input: {
  readonly setupProfileId: T3TeamProjectSetupProfileId;
  readonly customProfile?: T3TeamProfile | undefined;
  readonly packProfiles?: readonly EnvironmentSetupProfile[] | undefined;
}): ReviewSetupProfileSummary {
  if (input.customProfile) {
    return { title: input.customProfile.title, description: input.customProfile.description };
  }
  const option = listT3TeamProjectSetupCardOptions(input.packProfiles).find(
    (candidate) => candidate.id === input.setupProfileId,
  );
  return { title: option?.title ?? "Project Partner", description: option?.description };
}
