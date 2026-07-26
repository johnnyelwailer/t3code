import { useEffect, useRef } from "react";

import { useT3TeamDraftMutationStore } from "~/t3team/t3team-draftMutationStore";
import type { T3TeamDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import type { WorkItemFieldMutationResult } from "~/t3team/workitem/t3team-useWorkItemFieldMutation";

/**
 * Accepting a draft calls the exact same `mutation.commit` a direct edit would — optimistic apply,
 * rollback and the undo window all come from `useWorkItemFieldMutation` itself, so they behave
 * identically whichever way the change was initiated (the "Agent-proposed mutations" rule in
 * `41-work-item-detail-redesign.md`). This hook only watches that same mutation's outcome to move
 * the draft from `applying` to `applied`/`error`; it never writes anywhere on its own.
 *
 * Known gap: if a different edit supersedes the accept before it resolves, `useWorkItemFieldMutation`
 * deliberately never fires `error`/`lastChange` for the superseded request (see its own stale-request
 * guard), so the draft can be left at `applying`. Narrow — it needs a second edit racing the same
 * field within the same commit — and no worse than direct edits already tolerate.
 */
export function useWorkItemFieldDraftAccept<TValue>(
  mutation: Pick<WorkItemFieldMutationResult<TValue>, "commit" | "error" | "lastChange">,
) {
  const setDraftStatus = useT3TeamDraftMutationStore((state) => state.setDraftStatus);
  const acceptingRef = useRef<{ id: string; to: TValue } | null>(null);

  useEffect(() => {
    const accepting = acceptingRef.current;
    if (!accepting) return;
    if (mutation.error) {
      setDraftStatus(accepting.id, "error", mutation.error.headline);
      acceptingRef.current = null;
    } else if (mutation.lastChange && Object.is(mutation.lastChange.to, accepting.to)) {
      setDraftStatus(accepting.id, "applied");
      acceptingRef.current = null;
    }
  }, [mutation.error, mutation.lastChange, setDraftStatus]);

  return (draft: T3TeamDraftMutation, value: TValue) => {
    acceptingRef.current = { id: draft.id, to: value };
    setDraftStatus(draft.id, "applying");
    mutation.commit(value);
  };
}
