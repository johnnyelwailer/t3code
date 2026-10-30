import { ListChecks } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import type { ResolvedChangeSet } from "~/t3team/changeset/t3team-changeSetModel";
import type { ChangeSetDeps } from "~/t3team/changeset/t3team-changeSetRun";
import { applyButtonLabel } from "~/t3team/changeset/t3team-changeSetSelection";
import { WorkItemChangeSetOperationRow } from "~/t3team/changeset/t3team-WorkItemChangeSetOperationRow";
import { useWorkItemChangeSet } from "~/t3team/changeset/t3team-useWorkItemChangeSet";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

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
  const busy = set.progress !== undefined;
  const blocked = set.unavailableReason !== undefined && set.approvedCount > 0;
  const status = set.progress
    ? `Applying ${set.progress.done} of ${set.progress.total}…`
    : set.failedCount > 0
      ? `${plural(set.failedCount, "change")} did not apply.`
      : (set.discardError ?? set.unavailableReason ?? "");

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
          {plural(set.total, "change")} · {plural(set.groups.length, "issue")}
        </Badge>
      </header>

      {set.unrecordedCount > 0 ? (
        <p role="alert" className="border-b border-warning/30 bg-warning/8 px-3 py-2 text-xs">
          {plural(set.unrecordedCount, "change")} applied in Jira but could not be recorded. Do not
          apply again; use Retry recording.
        </p>
      ) : null}
      {set.uncertainCount > 0 ? (
        <p role="status" className="border-b border-warning/30 bg-warning/8 px-3 py-2 text-xs">
          {plural(set.uncertainCount, "change")} may already be in Jira. Check before retrying.
        </p>
      ) : null}

      <div className="max-h-[40vh] divide-y divide-border/50 overflow-y-auto">
        {set.groups.map((group) => (
          <div key={group.issueKey} className="py-1">
            <h3 className="px-3 pt-1 text-xs font-medium text-muted-foreground">
              {group.issueKey}
            </h3>
            {group.operations.map((operation) => {
              const { draftId } = operation.operation;
              return (
                <WorkItemChangeSetOperationRow
                  key={draftId}
                  resolved={operation}
                  decision={set.decisionOf(operation)}
                  outcome={set.outcomes.get(draftId)}
                  disabled={busy}
                  onToggle={() => set.toggle(operation)}
                  onRetryAnyway={() => void set.retryAnyway(draftId)}
                  onMarkApplied={() => void set.markApplied(draftId)}
                  onDismiss={() => void set.dismiss(draftId)}
                />
              );
            })}
          </div>
        ))}
      </div>

      {set.open ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-primary/20 px-3 py-2">
          <span role="status" className="min-w-0 flex-1 text-xs text-muted-foreground">
            {status}
          </span>
          {set.failedCount > 0 ? (
            <Button
              size="xs"
              variant="outline"
              disabled={busy || blocked}
              onClick={set.retryFailed}
            >
              Retry failed
            </Button>
          ) : null}
          <Button size="xs" variant="ghost" disabled={busy} onClick={set.discard}>
            Discard set
          </Button>
          <Button
            size="xs"
            disabled={busy || blocked || set.approvedCount + set.dismissCount === 0}
            onClick={set.apply}
          >
            {applyButtonLabel(set.approvedCount, set.dismissCount)}
          </Button>
        </footer>
      ) : null}
    </section>
  );
}
