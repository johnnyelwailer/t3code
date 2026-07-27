import type { KeyboardEvent } from "react";
import { Check, Search, UserMinus, UserRoundCheck } from "lucide-react";

import type { AtlassianAssignableUser } from "~/t3team/backend/t3team-types";
import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { Input } from "~/t3team/components/ui/t3team-input";
import { Spinner } from "~/t3team/components/ui/t3team-spinner";
import { cn } from "~/t3team/lib/t3team-utils";
import { WorkItemPersonAvatar } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";

const ROW_CLASSNAME =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent disabled:pointer-events-none disabled:opacity-50";

/**
 * The search box and result rows for {@link WorkItemAssigneeControl}'s popover — split out purely to
 * keep that file under the project's per-file line budget; it owns no state of its own.
 *
 * Each result row shows an avatar, the display name, and email as a muted secondary line — enough to
 * disambiguate two people who share a first name. The current assignee gets an aligned check.
 */
export function WorkItemAssigneeResultsList({
  query,
  onQueryChange,
  onQueryKeyDown,
  searchLoading,
  searchError,
  results,
  highlightedIndex,
  onHoverIndex,
  currentIdentity,
  onSelect,
}: {
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly onQueryKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly searchLoading: boolean;
  readonly searchError: unknown;
  readonly results: ReadonlyArray<AtlassianAssignableUser>;
  readonly highlightedIndex: number;
  readonly onHoverIndex: (index: number) => void;
  readonly currentIdentity: string | null;
  readonly onSelect: (user: AtlassianAssignableUser) => void;
}) {
  return (
    <div className="p-1.5">
      <div className="relative mb-1">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onQueryKeyDown}
          placeholder="Search people"
          aria-label="Search assignable people"
          autoFocus
          size="sm"
          className="pl-7 pr-7"
        />
        {searchLoading ? (
          <Spinner className="absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        ) : null}
      </div>

      <div role="listbox" aria-label="Assignable people" className="max-h-52 overflow-y-auto">
        {searchError ? (
          <div className="px-2 py-1.5">
            <T3TeamErrorState error={searchError} action="loading assignees" variant="inline" />
          </div>
        ) : results.length === 0 && !searchLoading ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">No people match.</p>
        ) : (
          results.map((user, index) => (
            <button
              key={user.accountId}
              type="button"
              role="option"
              aria-selected={currentIdentity === user.accountId}
              className={cn(ROW_CLASSNAME, index === highlightedIndex && "bg-accent")}
              onMouseEnter={() => onHoverIndex(index)}
              onClick={() => onSelect(user)}
            >
              <WorkItemPersonAvatar person={user} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{user.displayName}</span>
                {user.emailAddress ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {user.emailAddress}
                  </span>
                ) : null}
              </span>
              {currentIdentity === user.accountId ? (
                <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * "Assign to me" and "Unassign" — actions, not people, so they sit above the results list behind a
 * divider with icons rather than avatars, and cannot be mistaken for a person named "Unassign".
 */
export function WorkItemAssigneeActionRows({
  currentUserName,
  hasAssignee,
  onAssignToMe,
  onUnassign,
}: {
  readonly currentUserName?: string | undefined;
  readonly hasAssignee: boolean;
  readonly onAssignToMe: () => void;
  readonly onUnassign: () => void;
}) {
  return (
    <div className="p-1.5">
      {currentUserName ? (
        <button type="button" className={ROW_CLASSNAME} onClick={onAssignToMe}>
          <UserRoundCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          Assign to me
        </button>
      ) : null}
      <button type="button" className={ROW_CLASSNAME} disabled={!hasAssignee} onClick={onUnassign}>
        <UserMinus className="size-4 text-muted-foreground" aria-hidden="true" />
        Unassign
      </button>
    </div>
  );
}
