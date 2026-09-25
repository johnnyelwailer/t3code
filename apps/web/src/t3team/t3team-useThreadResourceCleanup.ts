/**
 * "Clean up this thread's resources" (flag `NEXI_FF_RESOURCE_PRESSURE`),
 * shared by the thread banner and the pressure panel: preview the plan, show
 * exactly which PIDs get SIGINT and why, and act only on the confirmed set
 * (the server re-verifies every identity and its lineage before signaling).
 */
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useCallback, useRef, useState } from "react";

import { toastManager } from "../components/ui/toast";
import { ensureLocalApi } from "../localApi";
import { serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import {
  cleanupConfirmMessage,
  cleanupResultDescription,
  cleanupResultTitle,
} from "./t3team-threadResourceCleanup.logic";

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function useThreadResourceCleanup(environmentId: EnvironmentId | null) {
  const preview = useAtomCommand(serverEnvironment.previewThreadResourceCleanup, {
    reportFailure: false,
  });
  const execute = useAtomCommand(serverEnvironment.cleanupThreadResources, {
    reportFailure: false,
  });
  const [busy, setBusy] = useState(false);
  // Guards the whole preview → confirm → act sequence against a double click.
  const busyRef = useRef(false);

  const cleanUp = useCallback(
    async (threadId: ThreadId) => {
      if (environmentId === null || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const planned = await preview({ environmentId, input: { threadId } });
        if (planned._tag === "Failure") {
          const description = errorMessage(squashAtomCommandFailure(planned));
          toastManager.add({ type: "error", title: "Could not plan the cleanup", description });
          return;
        }
        const plan = planned.value;
        const message = cleanupConfirmMessage(plan);
        if (message === null) {
          toastManager.add({
            type: "info",
            title: "Nothing to clean up",
            description: "This thread has no live agent session and no running background jobs.",
          });
          return;
        }
        const confirmed = await ensureLocalApi()
          .dialogs.confirm(message, { variant: "destructive" })
          .catch(() => false);
        if (!confirmed) return;
        const done = await execute({
          environmentId,
          input: {
            threadId,
            targets: plan.targets.map(({ pid, startTimeMs }) => ({ pid, startTimeMs })),
            stopAgentSession: plan.agentSession !== null,
          },
        });
        if (done._tag === "Failure") {
          const description = errorMessage(squashAtomCommandFailure(done));
          toastManager.add({ type: "error", title: "Cleanup failed", description });
          return;
        }
        toastManager.add({
          type: done.value.notSignaled.length === 0 ? "success" : "warning",
          title: cleanupResultTitle(done.value),
          description: cleanupResultDescription(done.value),
        });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [environmentId, execute, preview],
  );

  return { cleanUp, busy };
}
