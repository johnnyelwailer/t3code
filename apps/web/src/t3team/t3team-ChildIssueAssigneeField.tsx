import { useState } from "react";

import type { AtlassianAssignableUser } from "~/t3team/backend/t3team-types";
import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { Popover, PopoverPopup, PopoverTrigger } from "~/t3team/components/ui/t3team-popover";
import { useAssignableUserSearch } from "~/t3team/workitem/t3team-useAssignableUserSearch";
import {
  WorkItemAssigneeActionRows,
  WorkItemAssigneeResultsList,
} from "~/t3team/workitem/t3team-WorkItemAssigneeResultsList";
import { WorkItemPersonChip } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";

/**
 * The child-create form's assignee picker — the same search popover `WorkItemAssigneeControl`
 * shows (avatar rows, keyboard nav, "assign to me"), not the plainer inline list the backlog's
 * per-row assignee cell hand-rolls. Unlike that control, nothing is written on selection: this
 * just updates the draft, so there is no `useWorkItemFieldMutation` here (there is no existing
 * field value to optimistically replace before the child issue exists).
 */
export function ChildIssueAssigneeField({
  search,
  currentUserName,
  assignee,
  onChange,
  disabled,
}: {
  readonly search: (query?: string) => Promise<ReadonlyArray<AtlassianAssignableUser>>;
  readonly currentUserName?: string | undefined;
  readonly assignee: AtlassianAssignableUser | null;
  readonly onChange: (next: AtlassianAssignableUser | null) => void;
  readonly disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [assignToMeError, setAssignToMeError] = useState<unknown>(null);

  function select(next: AtlassianAssignableUser | null) {
    setAssignToMeError(null);
    onChange(next);
    setOpen(false);
  }

  const picker = useAssignableUserSearch({
    search,
    open,
    onSelect: select,
    onClose: () => setOpen(false),
  });

  async function assignToMe() {
    if (!currentUserName) return;
    setAssignToMeError(null);
    try {
      const matches = picker.results.length > 0 ? picker.results : await search(currentUserName);
      const normalized = currentUserName.trim().toLowerCase();
      const match =
        matches.find((user) => user.displayName.trim().toLowerCase() === normalized) ?? matches[0];
      if (!match) {
        setAssignToMeError(new Error(`No assignable Jira user matched "${currentUserName}".`));
        return;
      }
      select(match);
    } catch (cause) {
      setAssignToMeError(cause);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Assignee: ${assignee?.displayName ?? "Unassigned"}. Change assignee.`}
        disabled={disabled}
        className="-mx-1.5 inline-flex min-w-0 items-center rounded-md px-1.5 py-0.5 leading-none outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        <WorkItemPersonChip person={assignee ?? undefined} />
      </PopoverTrigger>
      <PopoverPopup align="start" side="bottom" className="w-72 p-0">
        <WorkItemAssigneeActionRows
          {...(currentUserName ? { currentUserName } : {})}
          hasAssignee={Boolean(assignee)}
          onAssignToMe={() => void assignToMe()}
          onUnassign={() => select(null)}
        />
        <div className="h-px bg-border" />
        <WorkItemAssigneeResultsList
          query={picker.query}
          onQueryChange={picker.setQuery}
          onQueryKeyDown={picker.handleQueryKeyDown}
          searchLoading={picker.searchLoading}
          searchError={picker.searchError}
          results={picker.results}
          highlightedIndex={picker.highlightedIndex}
          onHoverIndex={picker.setHighlightedIndex}
          currentIdentity={assignee?.accountId ?? null}
          onSelect={select}
        />
        {assignToMeError ? (
          <div className="px-2 pb-1.5">
            <T3TeamErrorState error={assignToMeError} action="assigning to you" variant="inline" />
          </div>
        ) : null}
      </PopoverPopup>
    </Popover>
  );
}
