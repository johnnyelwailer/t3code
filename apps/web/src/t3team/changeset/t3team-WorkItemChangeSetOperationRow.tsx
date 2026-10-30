import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import type { OperationOutcome } from "~/t3team/changeset/t3team-changeSetApply";
import type { ResolvedOperation } from "~/t3team/changeset/t3team-changeSetModel";
import {
  describeOperation,
  operationBadge,
} from "~/t3team/changeset/t3team-changeSetOperationView";
import { WorkItemDraftStripRow } from "~/t3team/workitem/t3team-WorkItemDraftStripRow";

const noop = () => {};

/** One operation: the strip's own row for the diff, plus the approve toggle and state badge. */
export function WorkItemChangeSetOperationRow({
  resolved,
  approved,
  outcome,
  disabled,
  onToggle,
}: {
  readonly resolved: ResolvedOperation;
  readonly approved: boolean;
  readonly outcome: OperationOutcome | undefined;
  readonly disabled: boolean;
  readonly onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { draft, state, operation } = resolved;
  // Rendered from the member draft; the set's own copies are only a fallback for a missing member.
  const view = draft
    ? describeOperation(draft)
    : { fieldLabel: operation.field, summary: operation.summary };
  const badge = operationBadge(state, outcome);
  const settled = state === "applied" || state === "dismissed" || state === "missing";
  const label = `${view.fieldLabel} for ${draft?.target.issueIdOrKey ?? operation.issueKey}`;
  const message = outcome?.message;

  return (
    <div className="flex items-start gap-2 px-3">
      <Checkbox
        className="mt-3"
        aria-label={`Approve proposed ${label}`}
        checked={state === "draft" && approved}
        disabled={disabled || settled || state === "changed"}
        onCheckedChange={onToggle}
      />
      <div className="min-w-0 flex-1">
        <WorkItemDraftStripRow
          row={{
            id: operation.draftId,
            fieldLabel: view.fieldLabel,
            ...("body" in view && view.words !== undefined
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
                {"body" in view && view.body ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-expanded={expanded}
                    onClick={() => setExpanded((open) => !open)}
                  >
                    {expanded ? "Hide text" : "Show text"}
                  </Button>
                ) : null}
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </span>
            ),
          }}
        />
        {expanded && "body" in view ? (
          <p className="whitespace-pre-wrap pb-2 pl-18 text-xs text-foreground">{view.body}</p>
        ) : null}
        {message ? (
          <p className="pb-2 pl-18 text-2xs text-destructive-foreground">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
