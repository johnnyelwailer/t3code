import { assigneeIdentity } from "~/t3team/workitem/t3team-assigneeIdentity";
import { useEffect, useState, type KeyboardEvent } from "react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import type { AtlassianAssignableUser } from "~/t3team/backend/t3team-types";
import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { T3TeamErrorStateInline } from "~/t3team/components/error/t3team-ErrorStateInline";
import { Popover, PopoverPopup, PopoverTrigger } from "~/t3team/components/ui/t3team-popover";
import { Spinner } from "~/t3team/components/ui/t3team-spinner";
import type { T3TeamScalarDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import { useDebouncedValue } from "~/t3team/workitem/t3team-useDebouncedValue";
import type { WorkItemFieldMutationResult } from "~/t3team/workitem/t3team-useWorkItemFieldMutation";
import {
  WorkItemFieldOverlay,
  WorkItemFieldUndoBanner,
} from "~/t3team/workitem/t3team-WorkItemFieldOverlay";
import { useWorkItemFieldDraftMarker } from "~/t3team/workitem/t3team-WorkItemFieldDraftReview";
import {
  WorkItemAssigneeActionRows,
  WorkItemAssigneeResultsList,
} from "~/t3team/workitem/t3team-WorkItemAssigneeResultsList";
import { readAssigneeDraftPatch } from "~/t3team/workitem/t3team-workItemDraftPatchReaders";
import { WorkItemPersonChip } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";
import type { WorkItemPerson } from "~/t3team/workitem/t3team-workItemFieldReaders";

type Assignee = WorkItemPerson | null;

/**
 * The assignee chip, made interactive: the chip itself is the trigger for a search popover — opening
 * it changes nothing, only picking an entry does. Reference shape for status and estimate: a value
 * that reads quietly at rest, with the entire value clickable rather than a separate hidden control.
 */
export function WorkItemAssigneeControl({
  backend,
  accountId,
  issueIdOrKey,
  draft,
  currentUserName,
  mutation,
  className,
}: {
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  readonly issueIdOrKey: string;
  /** A pending agent-proposed assignee change for this issue, if any. */
  readonly draft?: T3TeamScalarDraftMutation | undefined;
  readonly currentUserName?: string | undefined;
  /** Shared with the draft strip's Accept action — see `t3team-useWorkItemFieldMutations.ts`. */
  readonly mutation: WorkItemFieldMutationResult<Assignee>;
  readonly className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const [results, setResults] = useState<ReadonlyArray<AtlassianAssignableUser>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<unknown>(null);
  const [assignToMeError, setAssignToMeError] = useState<unknown>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSearchLoading(true);
    setSearchError(null);

    backend
      .searchAssignableUsers({
        accountId,
        issueIdOrKey,
        ...(debouncedQuery.trim() ? { query: debouncedQuery } : {}),
      })
      .then((users) => {
        if (cancelled) return;
        setResults(users);
        setHighlightedIndex(users.length > 0 ? 0 : -1);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setSearchError(cause);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, backend, debouncedQuery, issueIdOrKey, open]);

  function selectAssignee(next: AtlassianAssignableUser | null) {
    setAssignToMeError(null);
    mutation.commit(next);
    setOpen(false);
  }

  async function assignToMe() {
    if (!currentUserName) return;
    setAssignToMeError(null);
    try {
      const matches =
        results.length > 0
          ? results
          : await backend.searchAssignableUsers({
              accountId,
              issueIdOrKey,
              query: currentUserName,
            });
      const normalized = currentUserName.trim().toLowerCase();
      const match =
        matches.find((u) => u.displayName.trim().toLowerCase() === normalized) ?? matches[0];
      if (!match) {
        setAssignToMeError(new Error(`No assignable Jira user matched "${currentUserName}".`));
        return;
      }
      selectAssignee(match);
    } catch (cause) {
      setAssignToMeError(cause);
    }
  }

  function handleQueryKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      const highlighted = results[highlightedIndex];
      if (highlighted) {
        event.preventDefault();
        selectAssignee(highlighted);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  const currentIdentity = assigneeIdentity(mutation.value);
  const proposedAssignee = draft ? readAssigneeDraftPatch(draft) : undefined;
  const proposedLabel =
    proposedAssignee === undefined ? undefined : (proposedAssignee?.displayName ?? "Unassigned");
  const marker = useWorkItemFieldDraftMarker({
    issueIdOrKey,
    field: "assignee",
    draft,
    proposedLabel,
  });
  const overlay = mutation.error ? (
    <T3TeamErrorStateInline userFacing={mutation.error} showRetry={false} />
  ) : mutation.lastChange ? (
    <WorkItemFieldUndoBanner
      label={`Assignee → ${mutation.lastChange.to?.displayName ?? "Unassigned"}`}
      onUndo={mutation.undo}
    />
  ) : null;

  return (
    <WorkItemFieldOverlay overlay={overlay} className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={`Assignee: ${mutation.value?.displayName ?? "Unassigned"}. Change assignee.`}
          aria-busy={mutation.pending}
          disabled={mutation.pending}
          className="-mx-1.5 inline-flex min-w-0 items-center rounded-md px-1.5 py-0.5 leading-none outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <WorkItemPersonChip
              person={mutation.value ?? undefined}
              {...(currentUserName ? { currentUserName } : {})}
            />
            {marker}
            {mutation.pending ? <Spinner className="size-3 shrink-0" /> : null}
          </span>
        </PopoverTrigger>
        <PopoverPopup align="start" side="bottom" className="w-72 p-0">
          <WorkItemAssigneeActionRows
            {...(currentUserName ? { currentUserName } : {})}
            hasAssignee={Boolean(mutation.value)}
            onAssignToMe={() => void assignToMe()}
            onUnassign={() => selectAssignee(null)}
          />

          <div className="h-px bg-border" />

          <WorkItemAssigneeResultsList
            query={query}
            onQueryChange={setQuery}
            onQueryKeyDown={handleQueryKeyDown}
            searchLoading={searchLoading}
            searchError={searchError}
            results={results}
            highlightedIndex={highlightedIndex}
            onHoverIndex={setHighlightedIndex}
            currentIdentity={currentIdentity}
            onSelect={selectAssignee}
          />

          {assignToMeError ? (
            <div className="px-2 pb-1.5">
              <T3TeamErrorState
                error={assignToMeError}
                action="assigning to you"
                variant="inline"
              />
            </div>
          ) : null}
        </PopoverPopup>
      </Popover>
    </WorkItemFieldOverlay>
  );
}
