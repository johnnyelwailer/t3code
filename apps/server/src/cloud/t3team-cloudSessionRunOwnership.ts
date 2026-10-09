import type { WorkflowRunSummary } from "./t3team-githubActionsSessionClient.ts";

/** `actor.login` from a workflow run, or "" when the payload omits it. */
export function actorLogin(value: unknown): string {
  if (typeof value !== "object" || value === null) return "";
  const login = (value as { login?: unknown }).login;
  return typeof login === "string" ? login : "";
}

/**
 * Runs this person started. A warm standby belongs to the pool until it is
 * claimed, so it is not this person's session even if the host returned it.
 */
export function sessionRunsForLogin(
  runs: readonly WorkflowRunSummary[],
  login: string,
): readonly WorkflowRunSummary[] {
  return runs.filter((run) => run.actor === login && !run.name.includes(" · standby "));
}
