/**
 * User-facing failures for the description `Rewrite` launch.
 *
 * Split out of `t3team-useWorkItemAgentRewrite` so the controller stays flow-and-state only: every
 * way this launch can fail is described in one place, and none of them can be dropped silently
 * (`deliverDraftFeedbackToSourceThread` is the sibling case that established that rule).
 */

import {
  toUserFacingError,
  type T3TeamUserFacingError,
} from "~/t3team/components/error/t3team-errorMessage";

const REWRITE_ACTION = { action: "start the rewrite" } as const;
const THREAD_BUSY_FRAGMENT = "already has a turn in progress";

function isThreadBusyError(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  return message.includes(THREAD_BUSY_FRAGMENT);
}

/** A rejected launch. The busy-thread case gets its own wording because it is the one failure the
 * user can simply wait out, so it is offered as retryable rather than as an error to report. */
export function toWorkItemRewriteLaunchError(cause: unknown): T3TeamUserFacingError {
  return isThreadBusyError(cause)
    ? {
        headline: "This thread is still finishing a turn.",
        detail: "Wait for it to finish, then try again.",
        canRetry: true,
      }
    : toUserFacingError(cause, REWRITE_ACTION);
}

/** The recipe lives at `<workspaceRoot>/.t3team/recipes/describe-rewrite`; with no workspace there
 * is nothing to launch, and a launch without a `recipePath` would get no draft tools at all. */
export function workItemRewriteMissingWorkspaceError(): T3TeamUserFacingError {
  return toUserFacingError(
    new Error("This project has no local workspace, so the rewrite recipe cannot run."),
    REWRITE_ACTION,
  );
}

export function workItemRewriteDisconnectedError(): T3TeamUserFacingError {
  return toUserFacingError(new Error("The app is not connected to a server."), REWRITE_ACTION);
}
