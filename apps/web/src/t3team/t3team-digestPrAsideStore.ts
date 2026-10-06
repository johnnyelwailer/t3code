import type { PullRequestRef } from "@t3tools/contracts";
import { create } from "zustand";

/**
 * The PR a digest chip opened. The project dashboard's aside shows it in the app's own PR detail
 * panel instead of the quick starts, so reading a PR never leaves the digest.
 */
type DigestPrAsideStore = { readonly pullRequest: PullRequestRef | null };

export const useDigestPrAsideStore = create<DigestPrAsideStore>(() => ({ pullRequest: null }));

export function openDigestPullRequest(pullRequest: PullRequestRef) {
  useDigestPrAsideStore.setState({ pullRequest });
}

export function closeDigestPullRequest() {
  useDigestPrAsideStore.setState({ pullRequest: null });
}
