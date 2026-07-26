import { useState } from "react";
import { ChevronDown } from "lucide-react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import type { AtlassianBacklogBoardColumnStatus } from "~/t3team/backend/t3team-types";
import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { Badge } from "~/t3team/components/ui/t3team-badge";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "~/t3team/components/ui/t3team-menu";
import { Spinner } from "~/t3team/components/ui/t3team-spinner";
import { cn } from "~/t3team/lib/t3team-utils";
import type { T3TeamScalarDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import { WorkItemFieldOverlay } from "~/t3team/workitem/t3team-WorkItemFieldOverlay";
import { useWorkItemFieldDraftOverlay } from "~/t3team/workitem/t3team-useWorkItemFieldDraftOverlay";
import { useWorkItemFieldMutation } from "~/t3team/workitem/t3team-useWorkItemFieldMutation";
import type { WorkItemStatus } from "~/t3team/workitem/t3team-workItemFieldModel";
import {
  resolveWorkItemStatusTone,
  workItemStatusBadgeVariant,
  workItemStatusDotClassName,
} from "~/t3team/workitem/t3team-workItemFieldTokens";
import { readStatusDraftPatch } from "~/t3team/workitem/t3team-workItemDraftPatchReaders";
import { buildWorkItemStatusOptions } from "~/t3team/workitem/t3team-workItemStatusOptions";

/**
 * The status badge, made interactive: clicking it — the whole badge is the trigger, same shape as
 * the assignee chip — opens a menu of the board's own workflow statuses, current one marked.
 * Opening never commits; only picking an option does. Statuses load lazily on first open rather than
 * through the kanban board's polling cache, since this is one popover for one issue.
 */
export function WorkItemStatusControl({
  backend,
  accountId,
  externalProjectId,
  issueIdOrKey,
  status,
  draft,
  onReload,
  className,
}: {
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  readonly externalProjectId: string;
  readonly issueIdOrKey: string;
  readonly status: WorkItemStatus | undefined;
  /** A pending agent-proposed status change for this issue, if any. */
  readonly draft?: T3TeamScalarDraftMutation | undefined;
  readonly onReload: () => void;
  readonly className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [availableStatuses, setAvailableStatuses] = useState<
    ReadonlyArray<AtlassianBacklogBoardColumnStatus>
  >([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnsError, setColumnsError] = useState<unknown>(null);

  const mutation = useWorkItemFieldMutation<string>({
    value: status?.name ?? "",
    action: "changing the status",
    mutate: async (targetStatus) => {
      await backend.updateIssueStatus({ accountId, issueIdOrKey, targetStatus });
      onReload();
    },
  });

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen || availableStatuses.length > 0 || columnsLoading) return;

    setColumnsLoading(true);
    setColumnsError(null);
    backend
      .getBoardColumns({ account: { id: accountId, provider: "atlassian" }, externalProjectId })
      .then((response) => setAvailableStatuses(response.availableStatuses))
      .catch((cause: unknown) => setColumnsError(cause))
      .finally(() => setColumnsLoading(false));
  }

  const tone = resolveWorkItemStatusTone({
    ...(status?.categoryKey !== undefined ? { statusCategoryKey: status.categoryKey } : {}),
    statusName: mutation.value || status?.name,
  });
  const options = buildWorkItemStatusOptions(availableStatuses, mutation.value || undefined);
  const displayName = mutation.value || "No status";

  const proposedStatus = draft ? readStatusDraftPatch(draft) : undefined;
  const { marker, overlay } = useWorkItemFieldDraftOverlay({
    mutation,
    draft,
    proposedValue: proposedStatus,
    proposedLabel: proposedStatus,
    fieldLabel: "status",
    undoLabel: mutation.lastChange ? `Status → ${mutation.lastChange.to}` : undefined,
  });

  return (
    <WorkItemFieldOverlay overlay={overlay} className={className}>
      <Menu open={open} onOpenChange={handleOpenChange}>
        <MenuTrigger
          aria-label={`Status: ${displayName}. Change status.`}
          aria-busy={mutation.pending}
          disabled={mutation.pending}
          className="group/status inline-flex items-center rounded-sm leading-none outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
        >
          <Badge
            variant={workItemStatusBadgeVariant(tone)}
            className="gap-1.5 transition-colors group-hover/status:brightness-95 dark:group-hover/status:brightness-125"
          >
            <span
              aria-hidden="true"
              className={cn("size-1.5 rounded-full", workItemStatusDotClassName[tone])}
            />
            {displayName}
            {marker}
            {mutation.pending ? (
              <Spinner className="size-3" />
            ) : (
              <ChevronDown className="size-3 opacity-60" aria-hidden="true" />
            )}
          </Badge>
        </MenuTrigger>
        <MenuPopup aria-label="Change status" align="start" className="w-44">
          {columnsLoading ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading statuses…</div>
          ) : null}
          <MenuRadioGroup
            value={mutation.value}
            onValueChange={(value) => {
              if (typeof value === "string" && value !== mutation.value) mutation.commit(value);
              setOpen(false);
            }}
          >
            {options.map((option) => (
              <MenuRadioItem key={option.name} value={option.name}>
                {option.name}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          {columnsError ? (
            <div className="border-t border-border p-2">
              <T3TeamErrorState error={columnsError} action="loading statuses" variant="inline" />
            </div>
          ) : null}
        </MenuPopup>
      </Menu>
    </WorkItemFieldOverlay>
  );
}
