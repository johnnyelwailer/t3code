import type { Meta, StoryObj } from "@storybook/react";

import type { TurnId } from "@t3tools/contracts";
import { TimelineRowActivityCtx, WorkingTimelineRow } from "~/components/chat/MessagesTimeline";
import type { ActivityState } from "~/t3team/t3team-activityStateDisplay";

/**
 * Live-bug repro — "Writing for 1h 42m" truncates to "Writing for …" at
 * NORMAL panel widths (0.0.39 report).
 *
 * The real production `WorkingTimelineRow` with a 1h42m-old turn and the
 * `writing` live state: the lead must read "Writing for 1h 42m" in full at
 * normal widths, and only ellipsize at genuinely narrow ones (140px).
 */

// 1h42m in the past so the timer reads "for 1h 42m" on first paint.
const CREATED_1H42M_AGO = new Date(Date.now() - 65 * 60_000).toISOString();

const WORKING_ROW = {
  kind: "working" as const,
  id: "working-long-timer-row",
  createdAt: CREATED_1H42M_AGO,
};

function Row({
  threadActivityState,
  workingStepLabel = null,
}: {
  threadActivityState: ActivityState | null;
  workingStepLabel?: string | null;
}) {
  return (
    <TimelineRowActivityCtx.Provider
      value={{
        isWorking: true,
        isRevertingCheckpoint: false,
        latestTurnId: "turn-long-timer" as TurnId,
        workingStepLabel,
        activeAgents: [],
        onOpenAgents: () => {},
        threadActivityState,
      }}
    >
      <WorkingTimelineRow row={WORKING_ROW} />
    </TimelineRowActivityCtx.Provider>
  );
}

/** The production row wrapper (MessagesTimeline renderItem). */
function RowPanel({ width, children }: { width: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card p-2" style={{ width }}>
      <div className="mx-auto w-full min-w-0 max-w-3xl overflow-x-clip" data-timeline-root="true">
        {children}
      </div>
    </div>
  );
}

export default {
  title: "T3Team/Conversation/Working Row — Long Timer (Writing for 1h 42m)",
  tags: ["autodocs"],
} satisfies Meta;

type Story = StoryObj;

export const NormalWidths: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-3 p-6">
      {["max-w-3xl", "560px", "400px", "320px"].map((width) => (
        <div key={width} className="flex items-center gap-2">
          <span className="w-20 text-right font-mono text-[10px] text-muted-foreground">
            {width}
          </span>
          <RowPanel width={width}>
            <Row threadActivityState="writing" />
          </RowPanel>
        </div>
      ))}
    </div>
  ),
};

export const WithStepLabel: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-3 p-6">
      {["max-w-3xl", "400px"].map((width) => (
        <div key={width} className="flex items-center gap-2">
          <span className="w-20 text-right font-mono text-[10px] text-muted-foreground">
            {width}
          </span>
          <RowPanel width={width}>
            <Row threadActivityState="writing" workingStepLabel="Updating the release notes" />
          </RowPanel>
        </div>
      ))}
    </div>
  ),
};

export const NarrowLastResort: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-3 p-6">
      {["200px", "140px", "100px"].map((width) => (
        <div key={width} className="flex items-center gap-2">
          <span className="w-20 text-right font-mono text-[10px] text-muted-foreground">
            {width}
          </span>
          <RowPanel width={width}>
            <Row threadActivityState="writing" />
          </RowPanel>
        </div>
      ))}
    </div>
  ),
};
