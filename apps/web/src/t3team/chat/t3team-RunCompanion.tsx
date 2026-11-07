/**
 * A small companion under the working row (`thread.working`): it thinks while a run is active and
 * reacts for a few seconds when the run ends. It renders nothing unless companions are on and a
 * pack claims the placement. State is local: the working flag, the run status and one hold timer.
 */
import type { OrchestrationV2RunStatus } from "@t3tools/contracts";
import type { SurfaceCompanionMood } from "@t3team/pack-ui/contract";

import { appViewRegistry } from "~/t3team/packs/t3team-appViewRegistry";
import {
  companionFor,
  T3TeamCompanionSlot,
  useCompanionPreferences,
  useJustCleared,
} from "~/t3team/packs/t3team-CompanionSlot";
import { threadCompanionMood } from "~/t3team/packs/t3team-threadCompanionMood";

/** How long the reaction to a finished run stays. */
export const RUN_REACTION_HOLD_MS = 6000;

export function runCompanionMood(input: {
  readonly working: boolean;
  readonly justFinished: boolean;
  readonly latestRunStatus: OrchestrationV2RunStatus | null | undefined;
}): SurfaceCompanionMood | null {
  if (input.working) return "thinking";
  if (!input.justFinished) return null;
  const mood = threadCompanionMood({ working: false, latestRunStatus: input.latestRunStatus });
  return mood === "newThread" ? null : mood;
}

export function T3TeamRunCompanion({
  working,
  latestRunStatus,
}: {
  readonly working: boolean;
  readonly latestRunStatus: OrchestrationV2RunStatus | null | undefined;
}) {
  const { enabled } = useCompanionPreferences();
  const justFinished = useJustCleared(!working, RUN_REACTION_HOLD_MS);
  const mood = runCompanionMood({ working, justFinished, latestRunStatus });
  if (!enabled || mood === null) return null;
  if (companionFor(appViewRegistry(), "thread.working") === undefined) return null;
  return (
    <div className="messages-timeline-row-frame">
      <div className="chat-content-lane flex">
        <T3TeamCompanionSlot placement="thread.working" mood={mood} size="sm" className="ml-auto" />
      </div>
    </div>
  );
}
