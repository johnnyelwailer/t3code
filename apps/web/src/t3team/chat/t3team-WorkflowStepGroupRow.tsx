/**
 * The collapsed row a workflow step's machine traffic renders as.
 *
 * Deliberately NOT the user bubble: no `bg-accent`, no rounded chat shape. It is a quiet, full-width
 * disclosure — the step's label, how many messages it holds, and a chevron. Machine traffic should read as
 * machinery, and the label the author carries is already the sentence a human would write for it.
 *
 * Collapsed by DEFAULT and never hidden: PJ's standing principle for workflows is observability rather than
 * gates, so the transcript stays one click away for anyone who wants to check what the workflow actually
 * asked the model.
 */

import { BotIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import type { T3TeamWorkflowStepGroup } from "~/t3team/chat/t3team-workflowMessageGroups";

export function T3TeamWorkflowStepGroupRow({
  group,
  expanded,
  onToggle,
  className,
}: {
  readonly group: T3TeamWorkflowStepGroup;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly className?: string | undefined;
}) {
  const count = group.messageIds.length;
  const countLabel = `${String(count)} ${count === 1 ? "message" : "messages"}`;

  return (
    <button
      type="button"
      aria-expanded={expanded}
      data-workflow-step-group={group.stepId}
      data-workflow-step-expanded={expanded ? "true" : "false"}
      className={cn(
        "group flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/25 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      onClick={onToggle}
    >
      <BotIcon className="size-3.5 shrink-0 text-primary/70" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-medium text-foreground/80">{group.label}</span>
      <span className="shrink-0 tabular-nums">{countLabel}</span>
      {expanded ? (
        <ChevronDownIcon className="size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <ChevronRightIcon className="size-3.5 shrink-0" aria-hidden="true" />
      )}
    </button>
  );
}
