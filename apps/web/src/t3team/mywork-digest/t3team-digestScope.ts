/**
 * The digest's scope: which projects the server aggregates, and the signature that
 * invalidates the client cache when that scope changes.
 *
 * The signature includes the APP project id on purpose: two app projects can bind the
 * same Jira project (a loose workspace plus its stored counterpart), and the server joins
 * claims, decisions, and thread context per app project — so switching between them is a
 * scope change even though the Jira side of the key looks identical.
 */

import type { ProjectShellProject } from "@t3tools/project-context";

import type {
  MyWorkDigestProjectInput,
  MyWorkDigestScope,
} from "~/t3team/backend/t3team-myworkDigestBackendApi";

/** Projects the digest server can read: Atlassian bindings with an external project id. */
export function buildMyWorkDigestEntries(
  projects: ReadonlyArray<ProjectShellProject>,
): MyWorkDigestProjectInput[] {
  return projects
    .filter(
      (project): project is ProjectShellProject =>
        project.source?.provider === "atlassian" &&
        typeof project.source.externalProjectId === "string" &&
        project.source.externalProjectId !== "" &&
        typeof project.source.accountId === "string",
    )
    .map((project) => ({
      account: {
        id: project.source.accountId as string,
        provider: project.source.provider,
      },
      externalProjectId: project.source.externalProjectId as string,
      appProjectId: project.id,
      name: project.title,
    }));
}

/** A stable string for the scope; changes exactly when the digest must be re-fetched. */
export function digestScopeSignature(
  scope: MyWorkDigestScope,
  entries: ReadonlyArray<MyWorkDigestProjectInput>,
): string {
  return [
    scope,
    ...entries.map(
      (entry) => `${entry.account.id}:${entry.externalProjectId}:${entry.appProjectId ?? ""}`,
    ),
  ].join("|");
}
