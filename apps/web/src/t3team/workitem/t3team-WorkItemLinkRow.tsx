import { Trash2 } from "lucide-react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { T3TeamErrorStateInline } from "~/t3team/components/error/t3team-ErrorStateInline";
import { Button } from "~/t3team/components/ui/t3team-button";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { useWorkItemFieldMutation } from "~/t3team/workitem/t3team-useWorkItemFieldMutation";
import { WorkItemFieldUndoBanner } from "~/t3team/workitem/t3team-WorkItemFieldOverlay";
import { WorkItemIssueRow } from "~/t3team/workitem/t3team-WorkItemIssueRow";

/**
 * A linked-issue row with delete, when a live backend and the link's own Jira id are both
 * available. `WorkItemIssueRow` renders the whole row as a single button when `onOpen` is set, so
 * the delete control sits beside it as a sibling overlay rather than a nested button.
 *
 * There is no "undo delete link" endpoint either, so undo re-creates the same link through the
 * same create path a direct "Add link" would use.
 */
export function WorkItemLinkRow({
  backend,
  accountId,
  issueIdOrKey,
  linkId,
  linkTypeName,
  direction,
  otherIssueIdOrKey,
  onReload,
  ...rowProps
}: {
  readonly backend?: AtlassianBackendApi | undefined;
  readonly accountId?: string | undefined;
  readonly issueIdOrKey: string;
  readonly linkId?: string | undefined;
  readonly linkTypeName: string;
  readonly direction: "inward" | "outward";
  readonly otherIssueIdOrKey: string;
  readonly onReload?: (() => void) | undefined;
  readonly ticket: ProjectTicket;
  readonly relationLabel?: string | undefined;
  readonly currentUserName?: string | undefined;
  readonly onOpen?: ((ticketId: string) => void) | undefined;
}) {
  const canWrite = Boolean(backend && accountId && linkId && onReload);

  const visibleMutation = useWorkItemFieldMutation<boolean>({
    value: true,
    action: "removing the link",
    mutate: async (visible) => {
      if (!canWrite) return;
      if (visible) {
        // Undo: reload afterwards so the recreated link's real id replaces this row's guess.
        await backend!.createIssueLink({
          accountId: accountId!,
          issueIdOrKey,
          otherIssueIdOrKey,
          linkTypeName,
          direction,
        });
        onReload!();
      } else {
        // No `onReload()` here — reloading would drop this link from the parent's group
        // immediately, unmounting this row (and its undo banner) before the 10s window can ever
        // show. The optimistic `visible: false` stays authoritative until something else reloads.
        await backend!.deleteIssueLink({ accountId: accountId!, linkId: linkId! });
      }
    },
  });

  if (!visibleMutation.value) {
    if (!visibleMutation.lastChange) return null;
    return (
      <div className="px-3 py-2.5">
        <WorkItemFieldUndoBanner label="Link removed" onUndo={visibleMutation.undo} />
      </div>
    );
  }

  if (!canWrite) {
    return <WorkItemIssueRow {...rowProps} />;
  }

  return (
    <div className="group/link-row relative">
      <WorkItemIssueRow {...rowProps} />
      <div className="absolute right-2 top-1/2 hidden -translate-y-1/2 group-hover/link-row:block">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={visibleMutation.pending}
          aria-label="Remove link"
          onClick={() => visibleMutation.commit(false)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {visibleMutation.error ? (
        <div className="px-3 pb-2">
          <T3TeamErrorStateInline userFacing={visibleMutation.error} showRetry={false} />
        </div>
      ) : null}
    </div>
  );
}
