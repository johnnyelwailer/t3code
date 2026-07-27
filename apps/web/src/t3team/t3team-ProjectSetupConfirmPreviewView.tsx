import { useMemo } from "react";

import type { T3TeamProfile } from "@t3tools/t3team-skill-packs";

import { buildT3TeamProjectSetupConfirmPreview } from "~/t3team/t3team-projectSetupConfirmPreview";

/**
 * One always-visible line stating what creating this project will turn on: the profile's skill
 * packs, how many starter recipes match, and how many repositories are linked.
 *
 * This used to be a closed-by-default disclosure (title + chip row + a nested "N starter recipes"
 * sub-disclosure) sitting under the profile cards on a single overloaded "confirm" step. Now that
 * "review" is its own dedicated step whose only job is to state the consequence of the choices
 * made on the earlier steps, the summary can just say it once instead of hiding it behind two
 * levels of toggle.
 */
export function T3TeamProjectSetupConfirmPreviewView({
  profileId,
  customProfile,
  repositoryCount,
}: {
  readonly profileId: string;
  readonly customProfile?: T3TeamProfile;
  readonly repositoryCount: number;
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
    <div className="rounded-xl border border-border/65 bg-muted/15 px-3 py-2.5 text-sm">
      <span className="font-medium text-foreground">Turns on: </span>
      <span className="text-muted-foreground">
        {preview.skillPacks.map((pack) => pack.title).join(", ")}
        {" · "}
        {recipeCount} starter recipe{recipeCount === 1 ? "" : "s"}
        {" · "}
        {repositoryCount} repo{repositoryCount === 1 ? "" : "s"} linked
      </span>
    </div>
  );
}
