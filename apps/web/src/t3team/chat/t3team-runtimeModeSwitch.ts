import type { RuntimeMode } from "@t3tools/contracts";

/**
 * What picking an Access mode in the composer does.
 *
 * - `"none"`: the mode is already active.
 * - `"draft"`: a thread the server does not know yet keeps the choice in its
 *   composer draft; the thread is created with it.
 * - `"persist"`: an existing server thread gets the mode right away, so its
 *   next tool call runs under it. Waiting for the next typed send left voice
 *   threads (sent from the voice row, never the composer) and running turns on
 *   the old mode: a switch to Full access kept every call behind Auto's
 *   classifier.
 */
export type RuntimeModeSwitchPlan = "none" | "draft" | "persist";

export function planRuntimeModeSwitch(input: {
  readonly mode: RuntimeMode;
  readonly currentMode: RuntimeMode;
  readonly isServerThread: boolean;
  readonly serverRuntimeMode: RuntimeMode | undefined;
}): RuntimeModeSwitchPlan {
  if (!input.isServerThread || input.serverRuntimeMode === undefined) {
    return input.mode === input.currentMode ? "none" : "draft";
  }
  return input.mode === input.serverRuntimeMode ? "none" : "persist";
}
