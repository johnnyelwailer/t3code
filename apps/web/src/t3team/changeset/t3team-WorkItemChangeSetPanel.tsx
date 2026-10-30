import type { T3TeamThreadArtifact } from "@t3tools/contracts";

import { readChangeSetView } from "~/t3team/changeset/t3team-changeSetModel";
import type { ChangeSetDeps } from "~/t3team/changeset/t3team-changeSetRun";
import { WorkItemChangeSetCard } from "~/t3team/changeset/t3team-WorkItemChangeSetCard";

/** Every change set on a thread, resolved against the thread's own artifacts. */
export function WorkItemChangeSetPanel({
  threadId,
  artifacts,
  deps,
}: {
  readonly threadId: string;
  readonly artifacts: ReadonlyArray<T3TeamThreadArtifact>;
  readonly deps: ChangeSetDeps;
}) {
  const { resolved } = readChangeSetView(artifacts, threadId);
  if (resolved.length === 0) return null;
  return (
    <div data-work-item-change-sets>
      {resolved.map((set) => (
        <WorkItemChangeSetCard key={set.changeSet.id} resolved={set} deps={deps} />
      ))}
    </div>
  );
}
