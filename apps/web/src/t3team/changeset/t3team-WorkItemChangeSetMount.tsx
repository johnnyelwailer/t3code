import type { T3TeamThreadArtifact } from "@t3tools/contracts";

import { useBackend } from "~/t3team/backend/t3team-BackendContext";
import { createChangeSetAcceptOp } from "~/t3team/changeset/t3team-changeSetAcceptOp";
import type { ChangeSetDeps } from "~/t3team/changeset/t3team-useWorkItemChangeSet";
import { WorkItemChangeSetPanel } from "~/t3team/changeset/t3team-WorkItemChangeSetPanel";
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";
import { postDraftVerdict } from "~/t3team/workitem/t3team-recordDraftCarrierOutcome";

/**
 * Binds the change-set card to the app backend: field writes through the Atlassian backend, verdicts
 * through the thread's draft status route. Gated like the per-draft review it replaces for these drafts.
 */
export function WorkItemChangeSetMount({
  threadId,
  projectId,
  accountId,
  artifacts,
}: {
  readonly threadId: string;
  readonly projectId: string;
  readonly accountId: string | undefined;
  readonly artifacts: ReadonlyArray<T3TeamThreadArtifact>;
}) {
  const enabled = useFeatureFlag("WORKITEM_DETAIL_DRAFTS");
  const backend = useBackend();
  const httpBaseUrl = backend?.httpBaseUrl;
  const atlassian = backend?.atlassian;

  const post = (body: Record<string, string>) =>
    httpBaseUrl
      ? postDraftVerdict(httpBaseUrl, { threadId, ...body })
      : Promise.reject(new Error("No server connection to record the verdict."));
  const deps: ChangeSetDeps = {
    ...(atlassian && accountId
      ? { acceptOp: createChangeSetAcceptOp({ backend: atlassian, accountId, projectId }) }
      : {}),
    record: (draftId, status) => post({ draftId, status }),
    recordDiscard: (changeSetId) => post({ changeSetId, status: "discarded" }),
  };

  if (!enabled) return null;
  return <WorkItemChangeSetPanel threadId={threadId} artifacts={artifacts} deps={deps} />;
}
