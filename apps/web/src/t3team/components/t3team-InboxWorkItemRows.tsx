import { GitPullRequestIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import type { InboxWorkItemRow } from "~/t3team/t3team-inboxWorkItems";

/**
 * Work-item rows inside upstream's Inbox stream.
 *
 * Deliberately distinct from a thread card but built from the same sidebar
 * tokens, so they read as native Inbox entries rather than a project-management
 * tree grafted on top (doc 40).
 */
export function InboxWorkItemRows({ rows }: { rows: ReadonlyArray<InboxWorkItemRow> }) {
  const navigate = useNavigate();

  return (
    <>
      {rows.map((row) => (
        <li key={row.ticketId} data-t3team-inbox-work-item className="list-none py-0.5">
          <button
            type="button"
            onClick={() =>
              void navigate({
                to: "/t3team/projects/$projectId/tickets/$ticketId",
                params: { projectId: row.projectId, ticketId: row.ticketId },
              })
            }
            title={row.title || row.displayId}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md border-l-2 border-sidebar-border px-2.5 py-1.5 text-left hover:bg-sidebar-row-hover"
          >
            <span className="shrink-0 text-xs font-medium text-sidebar-muted-foreground">
              {row.displayId}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground">
              {row.title}
            </span>
            {row.pullRequestCount > 0 ? (
              <span className="flex shrink-0 items-center gap-0.5 text-xs text-sidebar-muted-foreground">
                <GitPullRequestIcon className="size-3" />
                {row.pullRequestCount}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </>
  );
}
