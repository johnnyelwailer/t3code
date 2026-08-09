/**
 * The submit side of "an action was preselected on this thread's composer".
 *
 * Kept out of `useThreadChatComposerState` so that hook stays a list of composer wirings rather than
 * growing a launch branch, and so the staging concern lives next to the component that renders it.
 *
 * Returns `null` when there is nothing staged, which is the caller's signal to fall through to its
 * normal send. Returns a promise when it handled the send — same `true`/`false` contract
 * `dispatchTurnStartOverride` already speaks.
 */

import { useCallback, useMemo } from "react";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { launchStagedComposerActionOnThread } from "~/t3team/chat/t3team-threadStagedActionLaunch";
import { isStagedComposerActionLaunchable } from "~/t3team/t3team-stagedComposerActionLaunch";
import {
  useT3TeamStagedComposerAction,
  useT3TeamStagedComposerActionStore,
} from "~/t3team/t3team-stagedComposerActionStore";

export type SubmitThreadStagedComposerAction = (input: {
  readonly backend: BackendApi;
  readonly threadId: string;
  readonly composerText: string;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
}) => Promise<boolean> | null;

export function useThreadStagedComposerAction(input: {
  readonly projectId: string;
  readonly ticketId?: string | undefined;
}): SubmitThreadStagedComposerAction {
  const target = useMemo(
    () => (input.ticketId ? { projectId: input.projectId, ticketId: input.ticketId } : undefined),
    [input.projectId, input.ticketId],
  );
  const action = useT3TeamStagedComposerAction(target);
  const clear = useT3TeamStagedComposerActionStore((state) => state.clear);

  return useCallback(
    (submit) => {
      if (!target || !action || !isStagedComposerActionLaunchable(action)) {
        return null;
      }
      // One-way, and before the await: a second send cannot launch the same run twice. This is the
      // latch the `Rewrite` control itself used to hold while it owned the launch.
      clear(target);
      return launchStagedComposerActionOnThread({ ...submit, action });
    },
    [action, clear, target],
  );
}
