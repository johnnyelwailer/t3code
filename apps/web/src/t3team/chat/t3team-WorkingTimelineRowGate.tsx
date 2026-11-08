import { use } from "react";

import { TimelineRowCtx, type TimelineRow } from "~/components/chat/timelineRowContext";
import { WorkingTimelineRow } from "~/components/chat/TimelineWorkGroupRows";
import { useEnvironmentLiveState } from "~/cloud/t3team-useEnvironmentLiveState";

import { OfflineWorkingLabel } from "./t3team-offlineWorkingLabel";

/**
 * The timeline's working row, unless the thread's environment is not live. A turn "Working for
 * 15s" on a machine the app has not heard from in minutes is a claim nobody can back: while the
 * environment is offline (or its cloud session ended) the row says so, frozen, instead of
 * counting up. On reconnect the real row returns and its timer is right again at once.
 */
export function T3TeamWorkingTimelineRow({
  row,
}: {
  readonly row: Extract<TimelineRow, { kind: "working" }>;
}) {
  const { threadRef } = use(TimelineRowCtx);
  const liveState = useEnvironmentLiveState(threadRef?.environmentId ?? null);
  if (liveState === "live") return <WorkingTimelineRow row={row} />;
  return (
    <div data-t3team-working-row>
      <div className="border-b border-border/60 pb-2 pt-1">
        <div className="flex items-center px-1 text-sm leading-relaxed text-muted-foreground">
          <OfflineWorkingLabel state={liveState} />
        </div>
      </div>
    </div>
  );
}
