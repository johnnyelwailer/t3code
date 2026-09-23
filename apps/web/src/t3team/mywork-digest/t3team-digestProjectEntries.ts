/**
 * Which of the scoped projects the digest can ask the server about: only Jira-bound
 * projects with an account and an external project id become request entries.
 */

import type { ProjectShellProject } from "@t3tools/project-context";

import type { MyWorkDigestProjectInput } from "~/t3team/backend/t3team-myworkDigestBackendApi";

export function toDigestProjectEntries(
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
        id: project.source?.accountId as string,
        provider: project.source?.provider as string,
      },
      externalProjectId: project.source?.externalProjectId as string,
      appProjectId: project.id,
      name: project.title,
    }));
}
