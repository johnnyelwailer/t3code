import { useEffect, useRef } from "react";

import type { RecipeDiscoveryStatus } from "~/t3team/t3team-useRecipeDiscovery";
import { settleDigestRecipeLaunch } from "~/t3team/t3team-digestRecipeLaunchStore";
import { reportRecipeLaunchFailure } from "~/t3team/t3team-launchFailureFeedback";

/**
 * Ends a digest recipe request whose recipe is not in the catalog once discovery has finished.
 * A request holds the narrow-screen drawer raised until the aside settles it, so one that can
 * never stage would leave the drawer up with no feedback. While discovery is pending nothing
 * happens however long it takes; a discovery that failed says so instead of blaming the recipe.
 */
export function useSettleUnavailableDigestRecipe(input: {
  readonly requestId: number | null;
  readonly recipeId: string;
  /** The catalog has no such recipe for this request. */
  readonly missing: boolean;
  /** `null` when there is no catalog to wait on. */
  readonly discovery: RecipeDiscoveryStatus | null;
  readonly alreadyStaged: (requestId: number) => boolean;
}) {
  const { requestId, recipeId, missing, discovery, alreadyStaged } = input;
  const reported = useRef<number | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- ends the request in the store and toasts once discovery has answered
  useEffect(() => {
    if (requestId === null || !missing || discovery === null || discovery === "pending") return;
    if (reported.current === requestId || alreadyStaged(requestId)) return;
    reported.current = requestId;
    settleDigestRecipeLaunch(requestId);
    reportRecipeLaunchFailure(
      "Could not start",
      new Error(
        discovery === "failed"
          ? "Recipes could not be loaded for this project."
          : `The "${recipeId}" recipe is not available in this project.`,
      ),
      "The recipe is not available.",
    );
  }, [requestId, recipeId, missing, discovery, alreadyStaged]);
}
