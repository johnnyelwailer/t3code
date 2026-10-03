import { type T3TeamEnvironmentCapabilities, type ThreadId, WS_METHODS } from "@t3tools/contracts";
import type { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { type EnvironmentThreadShell, threadRuntimeIsActive } from "./models.ts";
import { createEnvironmentRpcCommand } from "./runtime.ts";

/**
 * Fork "Stop incl. sub-runs": interrupt a thread's active run and every descendant subagent
 * thread's run (V2 lineage), as one server RPC. Clients offer it only on servers advertising
 * `capabilities.t3team.stopCascade`, and mint a fresh `commandId` per click — the server derives
 * every descendant interrupt's command id from it, so a retried request dispatches nothing twice.
 */
export const supportsT3TeamStopCascade = (
  capabilities: T3TeamEnvironmentCapabilities | undefined,
): boolean => capabilities?.stopCascade === true;

export function createT3TeamStopCascadeCommand<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return createEnvironmentRpcCommand(runtime, {
    label: "environment-data:t3team:stop-thread-cascade",
    tag: WS_METHODS.t3teamStopThreadCascade,
  });
}

/**
 * Whether a thread has a direct app-owned subagent child (V2 lineage) with live work: an active
 * run, or background work it still waits on (its own children). A cascade stop is only worth
 * offering then.
 */
export function hasLiveSubagentChild(
  shells: ReadonlyArray<
    Pick<EnvironmentThreadShell, "environmentId" | "lineage" | "runtime" | "pendingBackgroundTasks">
  >,
  parent: { readonly environmentId: string; readonly threadId: ThreadId },
): boolean {
  return shells.some(
    (shell) =>
      shell.environmentId === parent.environmentId &&
      shell.lineage.relationshipToParent === "subagent" &&
      shell.lineage.parentThreadId === parent.threadId &&
      (threadRuntimeIsActive(shell.runtime) || shell.pendingBackgroundTasks.length > 0),
  );
}
