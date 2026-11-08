/**
 * The delegate_task tool result's statement of where a cloud child runs
 * (`t3team-delegateTaskCloudSession.ts` places it).
 */
import type { ModelSelection } from "@t3tools/contracts";

import type { CloudSessionPlacement } from "./t3team-delegateTaskCloudSession.ts";

/** The tool result's statement of where the child runs. */
export function placementNote(
  placement: Extract<CloudSessionPlacement, { kind: "placed" }>,
  modelSelection: ModelSelection,
): string {
  const { session } = placement;
  const where = `cloud session '${session.name ?? "Cloud session"}' (${session.sessionId})`;
  const waits =
    "the child waits for it (up to about 15 minutes), then its provider and model are checked there";
  const state = placement.started
    ? `was started for it and is starting; ${waits}`
    : placement.ready
      ? `is ready${session.endsAt === undefined ? "" : ` until ${session.endsAt}`}`
      : `is still starting; ${waits}`;
  return `The child runs on ${where}, which ${state}. Its turns execute there with ${modelSelection.model} (${modelSelection.instanceId}); its messages and completion come back to this thread. Ending the child here interrupts it there.`;
}
