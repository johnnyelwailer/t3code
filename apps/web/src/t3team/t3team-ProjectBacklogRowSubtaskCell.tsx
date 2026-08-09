import { useState } from "react";
import { Plus } from "lucide-react";

import type {
  AtlassianAssignableUser,
  AtlassianChildIssueType,
} from "~/t3team/backend/t3team-types";
import { Badge } from "~/t3team/components/ui/t3team-badge";
import { Button } from "~/t3team/components/ui/t3team-button";
import { Popover, PopoverPopup, PopoverTrigger } from "~/t3team/components/ui/t3team-popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import { ChildIssueCreatePanel } from "~/t3team/t3team-ChildIssueCreatePanel";
import {
  EMPTY_CHILD_ISSUE_CREATE_DRAFT,
  type ChildIssueCreateDraft,
} from "~/t3team/t3team-childIssueCreateTypes";
import { isProjectTicketSubtask } from "~/t3team/t3team-projectBacklogUtils";
import type { ProjectBacklogSubtaskCreateInput, ProjectTicket } from "~/t3team/t3team-types";

export function ProjectBacklogRowSubtaskCell({
  ticket,
  canCreateSubtasks,
  onCreateSubtask,
  onSearchAssignableUsers,
  onListChildIssueTypes,
  compact = false,
  showCount = true,
  iconOnly = false,
}: {
  ticket: ProjectTicket;
  canCreateSubtasks: boolean;
  onCreateSubtask: (
    ticket: ProjectTicket,
    subtask: ProjectBacklogSubtaskCreateInput,
  ) => Promise<void>;
  onSearchAssignableUsers: (
    ticket: ProjectTicket,
    query?: string,
  ) => Promise<ReadonlyArray<AtlassianAssignableUser>>;
  onListChildIssueTypes?: () => Promise<ReadonlyArray<AtlassianChildIssueType>>;
  compact?: boolean;
  showCount?: boolean;
  iconOnly?: boolean;
}) {
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [draft, setDraft] = useState<ChildIssueCreateDraft>(EMPTY_CHILD_ISSUE_CREATE_DRAFT);
  const [subtaskSaving, setSubtaskSaving] = useState(false);
  const [subtaskError, setSubtaskError] = useState<string | null>(null);
  const canAddSubtasks = canCreateSubtasks && !isProjectTicketSubtask(ticket);
  const addSubtaskTooltip = `Quick-create subtask under ${ticket.ref.displayId}`;
  const resetSubtaskComposer = () => {
    setSubtaskError(null);
    setDraft(EMPTY_CHILD_ISSUE_CREATE_DRAFT);
    setSubtaskOpen(false);
  };

  async function handleCreateSubtask() {
    const trimmedSummary = draft.summary.trim();
    if (!trimmedSummary) {
      setSubtaskError("Subtask title is required.");
      return;
    }

    const trimmedEstimateHours = draft.estimateHours.trim();
    let estimateHours: number | undefined;
    if (trimmedEstimateHours) {
      const parsed = Number(trimmedEstimateHours);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setSubtaskError("Estimated hours must be a non-negative number.");
        return;
      }
      estimateHours = parsed;
    }

    setSubtaskSaving(true);
    setSubtaskError(null);
    try {
      await onCreateSubtask(ticket, {
        summary: trimmedSummary,
        ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
        ...(estimateHours !== undefined ? { estimateHours } : {}),
        ...(draft.issueTypeId ? { issueTypeId: draft.issueTypeId } : {}),
        ...(draft.assignee ? { assigneeAccountId: draft.assignee.accountId } : {}),
      });
      setDraft(EMPTY_CHILD_ISSUE_CREATE_DRAFT);
      setSubtaskOpen(false);
    } catch (cause) {
      setSubtaskError(cause instanceof Error ? cause.message : "Failed to create subtask.");
    } finally {
      setSubtaskSaving(false);
    }
  }

  if (!showCount && !canAddSubtasks) {
    return null;
  }

  const panelProps = {
    parentDisplayId: ticket.ref.displayId,
    draft,
    saving: subtaskSaving,
    error: subtaskError,
    searchAssignableUsers: (query?: string) => onSearchAssignableUsers(ticket, query),
    ...(onListChildIssueTypes ? { listChildIssueTypes: onListChildIssueTypes } : {}),
    onDraftChange: setDraft,
    onCancel: resetSubtaskComposer,
    onSubmit: () => {
      void handleCreateSubtask();
    },
  };

  return (
    <div className="min-w-0">
      {compact ? null : (
        <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Subtasks
        </div>
      )}
      <div className="space-y-2">
        <div className="flex min-h-7 items-center gap-1.5">
          {showCount ? <Badge variant="outline">{ticket.subtaskCount ?? 0}</Badge> : null}
          {canAddSubtasks ? (
            iconOnly ? (
              <Popover
                open={subtaskOpen}
                onOpenChange={(open) => {
                  setSubtaskError(null);
                  setSubtaskOpen(open);
                }}
              >
                <Tooltip>
                  <TooltipTrigger render={<span className="inline-flex" />}>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          aria-label={addSubtaskTooltip}
                          title={addSubtaskTooltip}
                          className="inline-flex size-7 items-center justify-center rounded-md border border-transparent bg-transparent text-[11px] leading-none text-muted-foreground transition-[border-color,background-color,color] hover:border-border/70 hover:bg-background/90 hover:text-foreground focus-visible:border-border/70 focus-visible:bg-background/90 focus-visible:text-foreground"
                        />
                      }
                    >
                      <Plus className="size-3.5" />
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipPopup side="top" align="center">
                    {addSubtaskTooltip}
                  </TooltipPopup>
                </Tooltip>
                <PopoverPopup
                  align="start"
                  side="bottom"
                  className="w-[22rem] max-w-[calc(100vw-2rem)] border-border/80 p-2.5 shadow-xl"
                >
                  <ChildIssueCreatePanel {...panelProps} className="space-y-2" />
                </PopoverPopup>
              </Popover>
            ) : (
              <Button
                type="button"
                variant={subtaskOpen ? "secondary" : "outline"}
                size="xs"
                aria-expanded={subtaskOpen}
                onClick={() => {
                  setSubtaskError(null);
                  setSubtaskOpen((current) => !current);
                }}
              >
                <Plus className="size-3.5" />
                Add subtask
              </Button>
            )
          ) : null}
        </div>
        {!iconOnly && subtaskOpen ? (
          <ChildIssueCreatePanel
            {...panelProps}
            className="rounded-md border border-border/70 bg-muted/10 p-2.5"
          />
        ) : null}
      </div>
    </div>
  );
}
