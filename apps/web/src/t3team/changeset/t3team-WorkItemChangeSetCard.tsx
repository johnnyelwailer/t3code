import { ListChecks } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import type { ResolvedChangeSet } from "~/t3team/changeset/t3team-changeSetModel";
import { WorkItemChangeSetOperationRow } from "~/t3team/changeset/t3team-WorkItemChangeSetOperationRow";
import {
  type ChangeSetDeps,
  useWorkItemChangeSet,
} from "~/t3team/changeset/t3team-useWorkItemChangeSet";

const APPLY_UNAVAILABLE = "Connect the Atlassian account for this project to apply changes.";

/** The preview/approval card for one change set: operations grouped by issue, one verdict each. */
export function WorkItemChangeSetCard({
  resolved,
  deps,
}: {
  readonly resolved: ResolvedChangeSet;
  readonly deps: ChangeSetDeps;
}) {
  const set = useWorkItemChangeSet(resolved, deps);
  const { changeSet } = resolved;
  const busy = set.progress !== null;

  if (changeSet.status === "discarded") {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        Change set discarded: {changeSet.title}
      </p>
    );
  }

  return (
    <section
      aria-label={`Proposed changes: ${changeSet.title}`}
      className="border-b border-primary/20 bg-background"
    >
      <header className="flex items-center gap-2 border-b border-primary/20 bg-primary/5 px-3 py-2">
        <ListChecks className="size-3.5 text-primary" aria-hidden="true" />
        <h2 className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {changeSet.title}
        </h2>
        <Badge variant="secondary">
          {set.total} change{set.total === 1 ? "" : "s"} · {set.groups.length} issue
          {set.groups.length === 1 ? "" : "s"}
        </Badge>
      </header>

      <div className="max-h-[40vh] divide-y divide-border/50 overflow-y-auto">
        {set.groups.map((group) => (
          <div key={group.issueKey} className="py-1">
            <h3 className="px-3 pt-1 text-xs font-medium text-muted-foreground">
              {group.issueKey}
            </h3>
            {group.operations.map((operation) => (
              <WorkItemChangeSetOperationRow
                key={operation.operation.draftId}
                resolved={operation}
                approved={!set.rejected.has(operation.operation.draftId)}
                outcome={set.outcomes.get(operation.operation.draftId)}
                disabled={busy}
                onToggle={() => set.toggle(operation.operation.draftId)}
              />
            ))}
          </div>
        ))}
      </div>

      {set.open ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-primary/20 px-3 py-2">
          <span role="status" className="min-w-0 flex-1 text-xs text-muted-foreground">
            {set.progress
              ? `Applying ${set.progress.done} of ${set.progress.total}…`
              : set.failedCount > 0
                ? `${set.failedCount} change${set.failedCount === 1 ? "" : "s"} did not apply.`
                : (set.discardError ?? (set.canApply ? "" : APPLY_UNAVAILABLE))}
          </span>
          {set.failedCount > 0 ? (
            <Button size="xs" variant="outline" disabled={busy} onClick={set.retryFailed}>
              Retry failed
            </Button>
          ) : null}
          <Button size="xs" variant="ghost" disabled={busy} onClick={set.discard}>
            Discard set
          </Button>
          <Button
            size="xs"
            disabled={busy || !set.canApply || set.approvedCount + set.rejectedCount === 0}
            onClick={set.apply}
          >
            Apply approved ({set.approvedCount})
          </Button>
        </footer>
      ) : null}
    </section>
  );
}
