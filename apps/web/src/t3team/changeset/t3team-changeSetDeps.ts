import type { ProjectSource } from "@t3tools/project-context";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { BackendApiError } from "~/t3team/backend/t3team-t3BackendHttp";
import { createChangeSetAcceptOp } from "~/t3team/changeset/t3team-changeSetAcceptOp";
import type { ChangeSetDeps } from "~/t3team/changeset/t3team-changeSetRun";
import { postDraftVerdict } from "~/t3team/workitem/t3team-recordDraftCarrierOutcome";

export type ChangeSetProjectSource = Pick<
  ProjectSource,
  "provider" | "accountId" | "externalProjectId" | "externalProjectKey"
>;

/** Apply needs a Jira-bound project with a resolvable account; otherwise the reason is shown. */
function applyAccess(
  source: ChangeSetProjectSource | undefined,
  atlassian: AtlassianBackendApi | undefined,
) {
  if (source?.provider !== "atlassian") {
    return {
      ok: false,
      reason: "This thread's project is not connected to Jira, so changes cannot be applied.",
    } as const;
  }
  if (!source.accountId || !atlassian) {
    return {
      ok: false,
      reason: "Connect the Atlassian account for this project to apply changes.",
    } as const;
  }
  return { ok: true, accountId: source.accountId, atlassian } as const;
}

/** Binds the card to the app backend: Jira writes through the Atlassian backend, verdicts through the thread. */
export function buildChangeSetDeps(input: {
  readonly threadId: string;
  readonly source: ChangeSetProjectSource | undefined;
  readonly atlassian: AtlassianBackendApi | undefined;
  readonly httpBaseUrl: string | undefined;
}): ChangeSetDeps {
  const post = (body: Record<string, string>) =>
    input.httpBaseUrl
      ? postDraftVerdict(input.httpBaseUrl, { threadId: input.threadId, ...body })
      : Promise.reject(new Error("No server connection to record the verdict."));
  const access = applyAccess(input.source, input.atlassian);
  return {
    ...(access.ok
      ? {
          acceptOp: createChangeSetAcceptOp({
            backend: access.atlassian,
            accountId: access.accountId,
            externalProjectId: input.source?.externalProjectId,
            projectKey: input.source?.externalProjectKey,
          }),
        }
      : { unavailableReason: access.reason }),
    record: (draftId, status) => post({ draftId, status }),
    recordDiscard: (changeSetId) => post({ changeSetId, status: "discarded" }),
    isClearRejection: (cause) => cause instanceof BackendApiError,
  };
}
