import { useEffect, useState, type KeyboardEvent } from "react";

import type { AtlassianAssignableUser } from "~/t3team/backend/t3team-types";
import { useDebouncedValue } from "~/t3team/workitem/t3team-useDebouncedValue";

/**
 * The debounced search + keyboard-nav glue behind an assignable-people popover — extracted so a new
 * picker (the child-issue create form) doesn't clone what `WorkItemAssigneeControl` already does.
 * That control keeps its own copy inline for now (touching it is out of scope here), but both read
 * off `AtlassianBackendApi.searchAssignableUsers` through a caller-bound `search` callback, so a
 * later pass can move it over with no behavior change. Taking `search` rather than
 * `backend`/`accountId`/`issueIdOrKey` directly also lets the backlog surface — whose assignee
 * search is already a ticket-scoped callback, not a raw backend call — use this same hook.
 */
export function useAssignableUserSearch(input: {
  readonly search: (query?: string) => Promise<ReadonlyArray<AtlassianAssignableUser>>;
  readonly open: boolean;
  readonly onSelect: (user: AtlassianAssignableUser) => void;
  readonly onClose: () => void;
}) {
  const { search, open, onSelect, onClose } = input;
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const [results, setResults] = useState<ReadonlyArray<AtlassianAssignableUser>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<unknown>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSearchLoading(true);
    setSearchError(null);

    search(debouncedQuery.trim() || undefined)
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
  }, [debouncedQuery, open, search]);

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
        onSelect(highlighted);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return {
    query,
    setQuery,
    results,
    searchLoading,
    searchError,
    highlightedIndex,
    setHighlightedIndex,
    handleQueryKeyDown,
  };
}
