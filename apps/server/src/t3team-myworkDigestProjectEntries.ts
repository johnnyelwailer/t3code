/**
 * The digest's request entries for app projects, on the server: only Jira-bound projects with an
 * account and an external project id take part. The same rule as the web's
 * `toDigestProjectEntries`; here it feeds the `t3team.mywork.*` tools, which have no client to
 * build the request.
 */

import type { OrchestrationProjectShell } from "@t3tools/contracts";

import type { T3TeamMyWorkDigestInput } from "./t3team-myworkDigestTypes.ts";

function toDigestProjectEntries(
  shells: ReadonlyArray<OrchestrationProjectShell>,
): T3TeamMyWorkDigestInput["projects"] {
  return shells.flatMap((shell) => {
    const source = shell.source;
    if (source === undefined || source.provider !== "atlassian") return [];
    return [
      {
        account: { id: source.accountId, provider: source.provider },
        externalProjectId: source.externalProjectId,
        appProjectId: shell.id,
        name: shell.title,
      },
    ];
  });
}

/** One app project's digest request, or every bound project's when `projectId` is absent. */
export function toDigestInput(
  shells: ReadonlyArray<OrchestrationProjectShell>,
  projectId: string | undefined,
): T3TeamMyWorkDigestInput {
  return {
    scope: projectId === undefined ? "all" : "project",
    projects: toDigestProjectEntries(shells),
  };
}
