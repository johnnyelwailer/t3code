import { useCallback } from "react";

import { toUserFacingError } from "~/t3team/components/error/t3team-errorMessage";
import { useT3TeamDraftMutationStore } from "~/t3team/t3team-draftMutationStore";
import type { T3TeamDraftMutation } from "~/t3team/t3team-draftMutationTypes";

/**
 * Accept for a scalar draft that creates or removes something (a link, a subtask) rather than
 * changing a field's value in place — `useWorkItemFieldMutation`'s optimistic value-swap doesn't fit
 * a create/delete action, so this is the same `applying → applied/error` lifecycle without it: fire
 * the real backend call, land the draft on the outcome.
 */
export function useWorkItemDraftActionAccept() {
  const setDraftStatus = useT3TeamDraftMutationStore((state) => state.setDraftStatus);

  return useCallback(
    (draft: T3TeamDraftMutation, action: () => Promise<void>) => {
      setDraftStatus(draft.id, "applying");
      action()
        .then(() => setDraftStatus(draft.id, "applied"))
        .catch((cause: unknown) => {
          const message = toUserFacingError(cause, { action: "applying this change" }).headline;
          setDraftStatus(draft.id, "error", message);
        });
    },
    [setDraftStatus],
  );
}
