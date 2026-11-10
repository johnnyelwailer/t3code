/**
 * Which ToolAuth action the flusher should fire once for a provider gate result.
 * Install chains into sign-in on the server; connect is sign-in only.
 */
import type { CloudQueuedSendProviderGate } from "./t3team-cloudQueuedSendProviderGate";

export type CloudQueuedSendProviderEnsureAction = "install" | "connect";

export function ensureActionForProviderGate(
  gate: CloudQueuedSendProviderGate,
): CloudQueuedSendProviderEnsureAction | null {
  if (gate.kind === "needsInstall") return "install";
  if (gate.kind === "needsAuth") return "connect";
  return null;
}
