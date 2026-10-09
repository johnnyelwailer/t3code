import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { JiraSessionExpiredPanel } from "~/t3team/components/t3team-JiraSessionExpiredPanel";
import type { ProjectMyWorkContentState } from "~/t3team/t3team-projectMyWorkContentState";

/** A failed My Work fetch: sign back in when the Jira session died, otherwise a retryable error. */
export function ProjectMyWorkLoadFailure({
  state,
  onRetry,
}: {
  state: Extract<ProjectMyWorkContentState, { kind: "sessionExpired" | "error" }>;
  onRetry?: (() => void) | undefined;
}) {
  if (state.kind === "sessionExpired") {
    return <JiraSessionExpiredPanel onSignedIn={onRetry} />;
  }
  return (
    <T3TeamErrorState
      error={new Error(state.message)}
      action="load your Jira work"
      {...(onRetry ? { onRetry } : {})}
    />
  );
}
