import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  createT3TeamStopCascadeCommand,
  hasLiveSubagentChild,
} from "@t3tools/client-runtime/state/thread-stop-cascade";
import { CommandId, type EnvironmentId, type ThreadId } from "@t3tools/contracts";
import { useCallback } from "react";

import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { connectionAtomRuntime } from "~/connection/runtime";
import { randomUUID } from "~/lib/utils";
import { environmentThreadShells } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";

/** The fork's "stop including sub-runs" command; also the indicator card's *Leave it*. */
export const stopThreadCascade = createT3TeamStopCascadeCommand(connectionAtomRuntime);

/**
 * ChatView's "Stop incl. sub-runs" (split stop button): offered while the server supports the
 * cascade RPC and the thread has a live app-owned subagent child. Each click mints a fresh
 * command id, so a later stop still reaches a child an earlier one missed.
 */
export function useT3TeamStopCascade(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  readonly supported: boolean;
}): { readonly hasChildThreads: boolean; readonly onInterruptCascade?: () => void } {
  const { environmentId, threadId, supported } = input;
  // Selects one boolean, so shell churn elsewhere never re-renders the host.
  const selectHasLiveChild = useCallback(
    (shells: ReadonlyArray<EnvironmentThreadShell>) =>
      supported && threadId !== null && hasLiveSubagentChild(shells, { environmentId, threadId }),
    [environmentId, supported, threadId],
  );
  const hasChildThreads = useAtomValue(
    environmentThreadShells.threadShellsAtom,
    selectHasLiveChild,
  );
  const stop = useAtomCommand(stopThreadCascade, { reportFailure: false });
  const onInterruptCascade = useCallback(() => {
    if (threadId === null) return;
    void (async () => {
      const result = await stop({
        environmentId,
        input: { threadId, commandId: CommandId.make(randomUUID()) },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not stop the sub-runs",
            description: error instanceof Error ? error.message : "The stop request failed.",
          }),
        );
      }
    })();
  }, [environmentId, stop, threadId]);
  return hasChildThreads ? { hasChildThreads, onInterruptCascade } : { hasChildThreads };
}
