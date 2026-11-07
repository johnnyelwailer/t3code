/**
 * What the `thread.new` companion does for a thread's run state: it thinks while a run is
 * active, cheers when the latest run completed, reacts to one that failed, and otherwise waits for
 * the first message. Reads state the chat already has; nothing here fetches or subscribes.
 */
import type { OrchestrationV2RunStatus } from "@t3tools/contracts";
import type { SurfaceCompanionMood } from "@t3team/pack-ui/contract";

export function threadCompanionMood(input: {
  readonly working: boolean;
  readonly latestRunStatus: OrchestrationV2RunStatus | null | undefined;
}): SurfaceCompanionMood {
  if (input.working) return "thinking";
  if (input.latestRunStatus === "completed") return "success";
  if (input.latestRunStatus === "failed") return "error";
  return "newThread";
}
