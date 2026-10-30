import type { DesktopUpdateIssue, DesktopUpdateState } from "@t3tools/contracts";

/**
 * The named reason belongs to an error: once the state has no error context (a check started, an
 * update was found, a download began) it is dropped, so a stale "signed out" can never outlive the
 * error it described. `feed` marks a state as coming from the interim Nexi Work feed.
 */
export function withUpdateIssue(
  state: DesktopUpdateState,
  issue: DesktopUpdateIssue | null,
  nexiFeedActive: boolean,
): DesktopUpdateState {
  const { issue: _previous, feed: _feed, ...rest } = state;
  return {
    ...rest,
    ...(nexiFeedActive ? { feed: "nexi-ghe" as const } : {}),
    ...(issue !== null && state.errorContext !== null ? { issue } : {}),
  };
}

const DEFAULT_POLL = "4 minutes";
const NEXI_POLL = "3 hours";
const NEXI_RETRY_AFTER_UNREACHABLE = "15 minutes";

/**
 * How long the poller waits before its next check. The GHE feed is read every few hours (each check
 * is an authenticated API call), and a check that could not reach GHE is retried sooner, quietly.
 */
export function updatePollDelay(nexiFeedActive: boolean, issue: DesktopUpdateIssue | null): string {
  if (!nexiFeedActive) return DEFAULT_POLL;
  return issue === "unreachable" ? NEXI_RETRY_AFTER_UNREACHABLE : NEXI_POLL;
}
