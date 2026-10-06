import type { PullRequestRef } from "@t3tools/contracts";
import { create } from "zustand";

/**
 * What a digest row opened beside itself: a PR (in the app's own PR detail panel) or a ticket (its
 * work-item detail). The project dashboard's aside shows it instead of the quick starts, so reading
 * a detail never leaves the digest; one at a time, the newer replaces the older.
 */
export type DigestAsideTicket = {
  readonly projectId: string;
  readonly ticketId: string;
  /** The full page of the ticket the aside shows now (it may have moved to a parent or child). */
  readonly openFullPage?: (ticketId: string) => void;
};

type DigestPrAsideStore = {
  readonly pullRequest: PullRequestRef | null;
  readonly ticket: DigestAsideTicket | null;
};

export const useDigestPrAsideStore = create<DigestPrAsideStore>(() => ({
  pullRequest: null,
  ticket: null,
}));

export function openDigestPullRequest(pullRequest: PullRequestRef) {
  useDigestPrAsideStore.setState({ pullRequest, ticket: null });
}

export function openDigestTicket(ticket: DigestAsideTicket) {
  useDigestPrAsideStore.setState({ ticket, pullRequest: null });
}

/** Closes whatever detail the aside shows; the quick starts come back. */
export function closeDigestPullRequest() {
  useDigestPrAsideStore.setState({ pullRequest: null, ticket: null });
}
