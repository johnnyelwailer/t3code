import { Check } from "lucide-react";

import type {
  AtlassianAssignableUser,
  AtlassianChildIssueType,
} from "~/t3team/backend/t3team-types";
import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { ProjectBacklogRowSubtaskCell } from "~/t3team/t3team-ProjectBacklogRowPlanningCells";
import type { ProjectBacklogSubtaskCreateInput, ProjectTicket } from "~/t3team/t3team-types";

export function ProjectBacklogTableRowActionCell({
  contextOnly,
  rowDirty,
  rowError,
  rowSaving,
  ticket,
  canCreateSubtasks,
  onCreateSubtask,
  onSearchAssignableUsers,
  onListChildIssueTypes,
  onCommitRow,
}: {
  contextOnly: boolean;
  rowDirty: boolean;
  rowError: string | null;
  rowSaving: boolean;
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
  onCommitRow: () => void;
}) {
  const stickyActionCellClass = contextOnly
    ? "sticky right-3 z-10 w-px whitespace-nowrap border-l border-border/40 bg-muted/10 px-1.5 py-1.5 align-middle text-right group-hover:bg-muted/18"
    : "sticky right-3 z-10 w-px whitespace-nowrap border-l border-border/40 bg-background/95 px-1.5 py-1.5 align-middle text-right group-hover:bg-muted/18";

  return (
    <td className={stickyActionCellClass}>
      <div className="flex min-h-7 items-center justify-end">
        {rowDirty ? (
          <button
            type="button"
            aria-label={`Save changes for ${ticket.ref.displayId}`}
            title={rowSaving ? "Saving row changes" : "Save row changes"}
            disabled={rowSaving}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/90 text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:cursor-default disabled:opacity-50"
            onClick={onCommitRow}
          >
            <Check className="size-3.5" />
          </button>
        ) : (
          <ProjectBacklogRowSubtaskCell
            compact
            iconOnly
            showCount={false}
            ticket={ticket}
            canCreateSubtasks={canCreateSubtasks}
            onCreateSubtask={onCreateSubtask}
            onSearchAssignableUsers={onSearchAssignableUsers}
            {...(onListChildIssueTypes ? { onListChildIssueTypes } : {})}
          />
        )}
      </div>
      {rowError ? (
        <div className="mt-1">
          <T3TeamErrorState error={rowError} variant="inline" />
        </div>
      ) : null}
    </td>
  );
}
