import { useEffect } from "react";

import { settleDigestRecipeLaunch } from "~/t3team/t3team-digestRecipeLaunchStore";
import { reportRecipeLaunchFailure } from "~/t3team/t3team-launchFailureFeedback";

/** How long a digest request may wait for discovery to list its recipe before it gives up. */
export const DIGEST_RECIPE_UNAVAILABLE_GRACE_MS = 5_000;

/**
 * Ends a digest recipe request whose recipe never shows up in the catalog. A request stays set
 * while the aside holds its staging (and keeps the narrow-screen drawer raised), so one that can
 * never stage would leave the drawer up with no feedback. The grace covers discovery still
 * loading; the timer is keyed by primitives so a re-render does not restart it.
 */
export function useSettleUnavailableDigestRecipe(input: {
  readonly requestId: number | null;
  readonly recipeId: string;
  readonly unavailable: boolean;
  /** Must be referentially stable, or the grace timer restarts on every render. */
  readonly alreadyStaged: (requestId: number) => boolean;
}) {
  const { requestId, recipeId, unavailable, alreadyStaged } = input;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a timer that ends the request in the store if its recipe never lists
  useEffect(() => {
    if (requestId === null || !unavailable) return;
    const timer = window.setTimeout(() => {
      if (alreadyStaged(requestId)) return;
      settleDigestRecipeLaunch(requestId);
      reportRecipeLaunchFailure(
        "Could not start",
        new Error(`The "${recipeId}" recipe is not available in this project.`),
        "The recipe is not available.",
      );
    }, DIGEST_RECIPE_UNAVAILABLE_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [requestId, recipeId, unavailable, alreadyStaged]);
}
