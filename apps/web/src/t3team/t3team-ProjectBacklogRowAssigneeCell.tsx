import { useDeferredValue, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";

import type { AtlassianAssignableUser } from "~/t3team/backend/t3team-types";
import { Input } from "~/t3team/components/ui/t3team-input";
import { Popover, PopoverPopup, PopoverTrigger } from "~/t3team/components/ui/t3team-popover";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function ProjectBacklogRowAssigneeCell({
  ticket,
  onSearchAssignableUsers,
  onUpdateAssignee,
  compact = false,
}: {
  ticket: ProjectTicket;
  onSearchAssignableUsers: (
    ticket: ProjectTicket,
    query?: string,
  ) => Promise<ReadonlyArray<AtlassianAssignableUser>>;
  onUpdateAssignee: (
    ticket: ProjectTicket,
    assignee: AtlassianAssignableUser | null,
  ) => Promise<void>;
  compact?: boolean;
}) {
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [assignableUsers, setAssignableUsers] = useState<ReadonlyArray<AtlassianAssignableUser>>(
    [],
  );
  const [assigneeLoading, setAssigneeLoading] = useState(false);
  const [assigneeError, setAssigneeError] = useState<string | null>(null);
  const deferredAssigneeQuery = useDeferredValue(assigneeQuery);

  useEffect(() => {
    if (!assigneeOpen) return;
    let cancelled = false;
    setAssigneeLoading(true);
    setAssigneeError(null);

    void onSearchAssignableUsers(ticket, deferredAssigneeQuery)
      .then((users) => {
        if (cancelled) return;
        setAssignableUsers(users);
      })
      .catch((cause) => {
        if (cancelled) return;
        setAssigneeError(cause instanceof Error ? cause.message : "Failed to load users.");
      })
      .finally(() => {
        if (cancelled) return;
        setAssigneeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assigneeOpen, deferredAssigneeQuery, onSearchAssignableUsers, ticket]);

  const resolvedAssigneeLabel = ticket.assignee ?? "Unassigned";

  function handleAssigneeSelection(assignee: AtlassianAssignableUser | null) {
    void onUpdateAssignee(ticket, assignee).then(() => setAssigneeOpen(false));
  }

  return (
    <div className="min-w-0">
      {compact ? null : (
        <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Assignee
        </div>
      )}
      <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              title={resolvedAssigneeLabel}
              className={
                compact
                  ? "inline-flex h-7 w-full min-w-0 max-w-none items-center justify-between gap-2 rounded-md border border-border/70 bg-background/90 px-2 text-left text-[11px] leading-none hover:bg-accent/40"
                  : "inline-flex h-8 min-w-[10rem] max-w-[13rem] items-center justify-between gap-2 rounded-md border border-border/70 bg-background/90 px-2.5 text-left text-[12px] leading-4 hover:bg-accent/40"
              }
            />
          }
        >
          <span className="truncate">{resolvedAssigneeLabel}</span>
          <UserPlus className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverPopup align="start" side="bottom" className="w-72 border-border/80 p-0">
          <div className="space-y-2 p-2.5">
            <Input
              className="h-8 border-border/80 bg-background text-[12px]"
              value={assigneeQuery}
              onChange={(event) => setAssigneeQuery(event.target.value)}
              placeholder="Search assignees"
            />
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-[12px] leading-4 hover:bg-accent"
              onClick={() => handleAssigneeSelection(null)}
            >
              Unassigned
            </button>
            <div className="max-h-48 overflow-y-auto">
              {assignableUsers.map((user) => (
                <button
                  key={user.accountId}
                  type="button"
                  className="w-full rounded-md px-2 py-1.5 text-left text-[12px] leading-4 hover:bg-accent"
                  onClick={() => handleAssigneeSelection(user)}
                >
                  <div className="font-medium">{user.displayName}</div>
                  {user.emailAddress ? (
                    <div className="text-xs text-muted-foreground">{user.emailAddress}</div>
                  ) : null}
                </button>
              ))}
              {assigneeLoading ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>
              ) : null}
              {!assigneeLoading && assignableUsers.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No matches.</div>
              ) : null}
            </div>
            {assigneeError ? <div className="text-xs text-destructive">{assigneeError}</div> : null}
          </div>
        </PopoverPopup>
      </Popover>
    </div>
  );
}
