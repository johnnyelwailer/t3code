import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { isJiraSyncStale } from "~/t3team/t3team-jiraSyncFreshness";

/**
 * When the digest's Jira half cannot be trusted, and what the user can do about it. The age of the
 * data is not repeated here: the header's status strip already prints it.
 */
export type DigestJiraNotice = {
  readonly kind: "needs-reconnect" | "sync-error" | "stale";
  readonly lead: string;
  readonly detail: string;
  /** Sign-in fixes a dead session; every other cause is retried. */
  readonly action: "sign-in" | "retry";
};

const LEAD = "Your Jira tickets may be out of date.";

type DigestJiraTrust = Pick<DigestGraph, "jiraAuth" | "jiraSyncError" | "jiraSyncedAt">;

export function resolveDigestJiraNotice(
  graph: DigestJiraTrust,
  nowMs: number,
): DigestJiraNotice | null {
  if (graph.jiraAuth === "needs-reconnect") {
    return {
      kind: "needs-reconnect",
      lead: LEAD,
      detail: "Your Jira session expired.",
      action: "sign-in",
    };
  }
  if (graph.jiraSyncError !== undefined) {
    return { kind: "sync-error", lead: LEAD, detail: graph.jiraSyncError, action: "retry" };
  }
  if (isJiraSyncStale(graph.jiraSyncedAt, nowMs)) {
    return {
      kind: "stale",
      lead: LEAD,
      detail: "Nexi Work could not refresh them.",
      action: "retry",
    };
  }
  return null;
}
