import type { T3TeamThreadArtifact } from "@t3tools/contracts";

import { useBackend } from "~/t3team/backend/t3team-BackendContext";
import {
  buildChangeSetDeps,
  type ChangeSetProjectSource,
} from "~/t3team/changeset/t3team-changeSetDeps";
import { WorkItemChangeSetPanel } from "~/t3team/changeset/t3team-WorkItemChangeSetPanel";
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

/** Gated like the per-draft review it replaces for these drafts. */
export function WorkItemChangeSetMount({
  threadId,
  projectSource,
  artifacts,
}: {
  readonly threadId: string;
  readonly projectSource: ChangeSetProjectSource | undefined;
  readonly artifacts: ReadonlyArray<T3TeamThreadArtifact>;
}) {
  const enabled = useFeatureFlag("WORKITEM_DETAIL_DRAFTS");
  const backend = useBackend();
  const deps = buildChangeSetDeps({
    threadId,
    source: projectSource,
    atlassian: backend?.atlassian,
    httpBaseUrl: backend?.httpBaseUrl,
  });

  if (!enabled) return null;
  return <WorkItemChangeSetPanel threadId={threadId} artifacts={artifacts} deps={deps} />;
}
