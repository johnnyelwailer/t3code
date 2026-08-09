import { useMemo } from "react";

import type { T3TeamProfile } from "@t3tools/t3team-skill-packs";

import { buildT3TeamProjectSetupConfirmPreview } from "~/t3team/t3team-projectSetupConfirmPreview";
import {
  WorkItemPropertyChips,
  WorkItemPropertyRow,
} from "~/t3team/workitem/t3team-WorkItemPropertyRow";

/**
 * The "Turns on" rows: which skill packs the selected profile enables, and which starter recipes
 * will already be usable. Both come from the same builder the previous single-line summary used
 * (`buildT3TeamProjectSetupConfirmPreview`) — this only changes how the result is laid out, not
 * what it computes, so what is shown here can never drift from what actually gets created.
 *
 * Returns bare rows (no `<dl>` of its own) so the review step can lay these out inside the same
 * list as `CreateProjectDialogReviewDetails`'s rows.
 */
export function T3TeamProjectSetupConfirmPreviewView({
  profileId,
  customProfile,
}: {
  readonly profileId: string;
  readonly customProfile?: T3TeamProfile;
}) {
  const preview = useMemo(
    () =>
      buildT3TeamProjectSetupConfirmPreview({
        profileId,
        ...(customProfile ? { customProfile } : {}),
      }),
    [profileId, customProfile],
  );
  const recipeCount = preview.topRecipes.length;

  return (
    <>
      <WorkItemPropertyRow label="Skill packs" values={preview.skillPacks}>
        <WorkItemPropertyChips values={preview.skillPacks.map((pack) => pack.title)} />
      </WorkItemPropertyRow>

      <WorkItemPropertyRow label="Starter recipes" values={preview.topRecipes}>
        <div className="space-y-1">
          <span className="text-muted-foreground">
            {recipeCount} recipe{recipeCount === 1 ? "" : "s"} ready to use
          </span>
          <WorkItemPropertyChips values={preview.topRecipes.map((recipe) => recipe.title)} />
        </div>
      </WorkItemPropertyRow>
    </>
  );
}
