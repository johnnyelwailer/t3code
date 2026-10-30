import type { T3TeamThreadArtifact } from "@t3tools/contracts";

import { readThreadChangeSets, resolveChangeSet } from "~/t3team/changeset/t3team-changeSetModel";
import { WorkItemChangeSetCard } from "~/t3team/changeset/t3team-WorkItemChangeSetCard";
import type { ChangeSetDeps } from "~/t3team/changeset/t3team-useWorkItemChangeSet";

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
  const sets = readThreadChangeSets(artifacts, threadId);
  if (sets.length === 0) return null;
  return (
    <div data-work-item-change-sets>
      {sets.map((changeSet) => (
        <WorkItemChangeSetCard
          key={changeSet.id}
          resolved={resolveChangeSet(changeSet, artifacts, threadId)}
          deps={deps}
        />
      ))}
    </div>
  );
}
