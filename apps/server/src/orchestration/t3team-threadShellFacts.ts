import {
  findLocalProviderKindByInstanceId,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";

import type { ProjectionThread } from "../persistence/Services/ProjectionThreads.ts";

/**
 * The t3team facts a thread shell carries from its projection row (migration 82).
 *
 * Projected rather than derived on the client: a list row that needs them would
 * otherwise read the thread's activity log and messages, which opens a
 * per-thread detail stream for every row (the 2026-09-29 subscribe churn).
 */
export function readT3TeamThreadShellFacts(
  row: Pick<ProjectionThread, "openChildWaitCount" | "localSessionInstanceId">,
): Pick<OrchestrationThreadShell, "hasOpenChildWait" | "localSessionInstanceId"> {
  // The column holds the raw `local:<instanceId>:` segment; only an instance this fork can adopt
  // sessions from reaches the shell.
  const localSession =
    row.localSessionInstanceId != null
      ? findLocalProviderKindByInstanceId(row.localSessionInstanceId)
      : undefined;
  return {
    ...((row.openChildWaitCount ?? 0) > 0 ? { hasOpenChildWait: true } : {}),
    ...(localSession !== undefined ? { localSessionInstanceId: localSession.instanceId } : {}),
  };
}
