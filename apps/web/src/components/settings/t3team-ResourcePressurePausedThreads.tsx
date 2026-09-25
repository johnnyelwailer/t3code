/**
 * Auto-paused threads in the memory-pressure panel (flag
 * `NEXI_FF_RESOURCE_PRESSURE`): which threads the host holds at a turn
 * boundary, why, and where the state machine is (holding while critical, or
 * resuming at the end of the cooldown). Each row offers the same one-click
 * per-thread cleanup as the thread banner.
 */
import type {
  EnvironmentId,
  ResourcePressureAutoPauseView,
  ResourcePressurePausedThread,
} from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";

import { useThreadShell } from "../../state/entities";
import { useThreadResourceCleanup } from "../../t3team/t3team-useThreadResourceCleanup";
import { Button } from "../ui/button";
import { useRelativeTimeTick } from "./settingsLayout";
import { Ago } from "./t3team-ResourcePressureParts";
import { autoPauseStateLabel } from "./t3team-ResourcePressurePanel.logic";

function PausedThreadRow(props: {
  environmentId: EnvironmentId;
  thread: ResourcePressurePausedThread;
  stateLabel: string;
  busy: boolean;
  onCleanUp: (threadId: ThreadId) => void;
}) {
  const threadId = ThreadId.make(props.thread.threadId);
  const shell = useThreadShell({ environmentId: props.environmentId, threadId });
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-xs">
      <div className="min-w-0">
        <div className="truncate">{shell?.title ?? props.thread.threadId}</div>
        <div className="text-[11px] text-muted-foreground/70">
          Memory pressure · {props.stateLabel} · paused <Ago at={props.thread.pausedAt} /> ·{" "}
          {props.thread.heldTurnCount} turn(s) held
        </div>
      </div>
      <Button
        size="micro"
        variant="outline"
        disabled={props.busy}
        onClick={() => props.onCleanUp(threadId)}
      >
        Clean up…
      </Button>
    </li>
  );
}

export function PausedThreadList(props: {
  environmentId: EnvironmentId;
  autoPause: ResourcePressureAutoPauseView | undefined;
}) {
  const { cleanUp, busy } = useThreadResourceCleanup(props.environmentId);
  // Ticks once a second so the cooldown countdown stays live between panel refreshes.
  const nowMs = useRelativeTimeTick();
  const autoPause = props.autoPause;
  if (autoPause === undefined || autoPause.threads.length === 0) return null;
  const stateLabel = autoPauseStateLabel(autoPause, nowMs);
  return (
    <div>
      <div className="text-[11px] font-medium text-muted-foreground/70">
        Auto-paused threads (resume after {Math.round(autoPause.cooldownMs / 1000)} s below
        critical)
      </div>
      <ul className="divide-y divide-border/50">
        {autoPause.threads.map((thread) => (
          <PausedThreadRow
            key={thread.threadId}
            environmentId={props.environmentId}
            thread={thread}
            stateLabel={stateLabel}
            busy={busy}
            onCleanUp={(threadId) => void cleanUp(threadId)}
          />
        ))}
      </ul>
    </div>
  );
}
