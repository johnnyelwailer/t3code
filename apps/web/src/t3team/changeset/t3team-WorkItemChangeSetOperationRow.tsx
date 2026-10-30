import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import type { OperationOutcome } from "~/t3team/changeset/t3team-changeSetApply";
import type { HoldKind } from "~/t3team/changeset/t3team-changeSetOutcomeStore";
import type { ResolvedOperation } from "~/t3team/changeset/t3team-changeSetModel";
import {
  describeOperation,
  operationBadge,
  type OperationView,
} from "~/t3team/changeset/t3team-changeSetOperationView";
import { operationPolicy } from "~/t3team/changeset/t3team-changeSetPolicy";
import { isApprovable, type Decision } from "~/t3team/changeset/t3team-changeSetSelection";
import { WorkItemChangeSetOperationActions } from "~/t3team/changeset/t3team-WorkItemChangeSetOperationActions";
import { WorkItemDraftStripRow } from "~/t3team/workitem/t3team-WorkItemDraftStripRow";

const noop = () => {};

/** One operation: the strip's own row for the diff, plus the approve toggle, state badge and recovery actions. */
export function WorkItemChangeSetOperationRow({
  resolved,
  decision,
  outcome,
  hold,
  disabled,
  onToggle,
  onRetryAnyway,
  onMarkApplied,
  onDismiss,
}: {
  readonly resolved: ResolvedOperation;
  readonly decision: Decision;
  readonly outcome: OperationOutcome | undefined;
  readonly hold: HoldKind | undefined;
  readonly disabled: boolean;
  readonly onToggle: () => void;
  readonly onRetryAnyway: () => void;
  readonly onMarkApplied: () => void;
  readonly onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { draft, state, operation } = resolved;
  // Rendered from the member draft; the set's own copies are only a fallback for a missing member.
  const view: OperationView = draft
    ? describeOperation(draft)
    : { fieldLabel: operation.field, summary: operation.summary };
  const policy = operationPolicy(draft);
  const approvable = isApprovable(resolved) && hold === undefined;
  const dismissable =
    (state === "draft" || state === "changed") && !approvable && hold === undefined;
  const badge = operationBadge(state, outcome, decision);
  const label = `${view.fieldLabel} for ${draft?.target.issueIdOrKey ?? operation.issueKey}`;
  const note =
    outcome?.message ??
    (state === "draft" ? (policy.applicable ? policy.hint : policy.reason) : undefined);
  const { body } = view;

  return (
    <div className="px-3">
      <div className="flex items-start gap-2">
        <Checkbox
          className="mt-3"
          aria-label={`Approve proposed ${label}`}
          checked={approvable && decision === "approve"}
          disabled={disabled || !approvable}
          onCheckedChange={onToggle}
        />
        <div className="min-w-0 flex-1">
          <WorkItemDraftStripRow
            row={{
              id: operation.draftId,
              fieldLabel: view.fieldLabel,
              ...(view.words !== undefined
                ? {
                    reviewInPlace: { onClick: noop, added: view.words, removed: 0 },
                    summary: view.summary,
                  }
                : { changeLine: { from: "", to: view.summary } }),
              pending: false,
              highlighted: false,
              onComment: noop,
              onDismiss: noop,
              trailing: (
                <span className="flex shrink-0 items-center gap-1">
                  {body ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      aria-expanded={expanded}
                      onClick={() => setExpanded((open) => !open)}
                    >
                      {expanded ? "Hide text" : "Show text"}
                    </Button>
                  ) : null}
                  {dismissable ? (
                    <Button size="xs" variant="ghost" disabled={disabled} onClick={onToggle}>
                      {decision === "reject" ? "Keep" : "Dismiss"}
                    </Button>
                  ) : null}
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </span>
              ),
            }}
          />
          {expanded && body ? (
            <p className="whitespace-pre-wrap pb-2 pl-18 text-xs text-foreground">{body}</p>
          ) : null}
          {note ? <p className="pb-2 pl-18 text-2xs text-muted-foreground">{note}</p> : null}
          {hold ? (
            <WorkItemChangeSetOperationActions
              hold={hold}
              disabled={disabled}
              onRetryAnyway={onRetryAnyway}
              onMarkApplied={onMarkApplied}
              onDismiss={onDismiss}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
