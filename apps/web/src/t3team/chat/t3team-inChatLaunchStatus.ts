import type { ThreadBootstrapStatus } from "~/t3team/chat/t3team-runThreadBootstrapEffect";

export type InChatLaunchPhase = "creating" | "preparing";

/**
 * What the open chat should say while a local thread's launch is still in flight.
 *
 * The chat column exists as soon as the local record does. Progress stays inside it:
 * creating the server shell first, then context and the run. A failure stays visible
 * after the shell exists, instead of leaving an empty composer.
 */
export function resolveInChatLaunchStatus(input: {
  readonly hasServerThread: boolean;
  readonly bootstrapStatus: ThreadBootstrapStatus;
}): { readonly show: boolean; readonly phase: InChatLaunchPhase | null } {
  if (input.bootstrapStatus === "failed") {
    return { show: true, phase: null };
  }

  if (!input.hasServerThread) {
    return { show: true, phase: "creating" };
  }

  if (input.bootstrapStatus === "running") {
    return { show: true, phase: "preparing" };
  }

  return { show: false, phase: null };
}
