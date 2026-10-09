import { create } from "zustand";

import type { DigestRecipeScope } from "~/t3team/t3team-digestRecipeAction";
import { closeDigestPullRequest } from "~/t3team/t3team-digestPrAsideStore";

/**
 * A digest recipe pill asking the dashboard aside to stage `recipeId` for `scope`. The digest
 * (main pane) and the kickoff composer (aside) are siblings, so the ask travels through this
 * store the way `openDigestPullRequest` does. It stays set while the aside holds the staging,
 * which also keeps the narrow-screen drawer raised; the aside settles it when the staging ends.
 */
export type DigestRecipeLaunchRequest = {
  readonly id: number;
  readonly recipeId: string;
  readonly scope: DigestRecipeScope;
};

type DigestRecipeLaunchStore = { readonly request: DigestRecipeLaunchRequest | null };

export const useDigestRecipeLaunchStore = create<DigestRecipeLaunchStore>(() => ({
  request: null,
}));

let nextRequestId = 1;

/** Stages a recipe from a digest pill. The aside swaps a PR it shows for the kickoff composer. */
export function requestDigestRecipeLaunch(input: {
  readonly recipeId: string;
  readonly scope: DigestRecipeScope;
}) {
  closeDigestPullRequest();
  useDigestRecipeLaunchStore.setState({ request: { id: nextRequestId++, ...input } });
}

/** Ends request `id` (staging cleared, launched, or its aside gone); a newer request survives. */
export function settleDigestRecipeLaunch(id: number) {
  if (useDigestRecipeLaunchStore.getState().request?.id === id) {
    useDigestRecipeLaunchStore.setState({ request: null });
  }
}
