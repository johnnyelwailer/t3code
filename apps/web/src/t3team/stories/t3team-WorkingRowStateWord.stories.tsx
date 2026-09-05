import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";

import type { TurnId } from "@t3tools/contracts";
import { TimelineRowActivityCtx, WorkingTimelineRow } from "~/components/chat/MessagesTimeline";
import type { ActivityState } from "~/t3team/t3team-activityStateDisplay";

/**
 * GHE #208 follow-up — the working-row state word, on the REAL
 * `WorkingTimelineRow` (components/chat/MessagesTimeline.tsx).
 *
 * Two nits from the live test, both verified here:
 *
 * 1. "working" lookalike — the deterministic `working` state word is
 *    spelled exactly like the no-state fallback ("Working"). When the word
 *    comes from the server's deterministic activityState it now carries
 *    the live emphasis (font-medium); the fallback stays regular weight.
 *    One unified activity row, no new pills.
 *
 * 2. Timer clipping — in a narrow panel the lead was hard-clipping at the
 *    row wrapper's overflow-x-clip. The step label (shrink-100) stays the
 *    primary shrink point; the lead is the last-resort one and its timer
 *    text ellipsizes (the .t3team-aci-lead clamp in t3team-index.css —
 *    pure CSS, no JS width pinning) instead of clipping. The row stays
 *    ONE line — no wrap, no second line.
 */

const WORKING_ROW = {
  kind: "working" as const,
  id: "working-state-word-row",
  // 12s in the past so the timer reads "for 12s" on first paint.
  createdAt: new Date(Date.now() - 12_000).toISOString(),
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
        latestTurnId: "turn-working-state-word" as TurnId,
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

function Card({
  title,
  children,
  footnote,
}: {
  title: string;
  children: React.ReactNode;
  footnote?: string;
}) {
  return (
    <div className="w-[560px] rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-3 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="flex flex-col gap-3">{children}</div>
      {footnote ? <div className="text-[10px] text-muted-foreground/70">{footnote}</div> : null}
    </div>
  );
}

const EmphasisContent = (
  <>
    <Card
      title="All four live states — each from the server's deterministic activityState, so each carries the live emphasis (font-medium)"
      footnote={
        "Same letters, one cue apart: the live state word is slightly emphasized; the " +
        "no-state fallback 'Working' (below) is regular weight. The blue shimmer + the " +
        'left "..." dots are unchanged (they stand in only when no agent dots are on the row).'
      }
    >
      {(["thinking", "writing", "working", "waiting"] as const).map((state) => (
        <RowPanel key={state} width="520px">
          <Row threadActivityState={state} />
        </RowPanel>
      ))}
      <div className="text-xs font-medium text-muted-foreground">No-state fallback</div>
      <RowPanel width="520px">
        <Row threadActivityState={null} />
      </RowPanel>
    </Card>
  </>
);

const NarrowContent = (
  <Card
    title="Same live 'thinking' row at progressively narrower panel widths (real production row wrapper classes, incl. the overflow-x-clip)"
    footnote={
      "520px: everything fits. 320px: the step label truncates first. 200px: the step label is " +
      "gone, the timer still fits. 140px: last resort — the timer itself ellipsizes instead of " +
      "hard-clipping at the panel edge. One line at every width."
    }
  >
    {["520px", "320px", "200px", "140px"].map((width) => (
      <RowPanel key={width} width={width}>
        <Row threadActivityState="thinking" workingStepLabel="Refactoring the settings panel" />
      </RowPanel>
    ))}
  </Card>
);

/**
 * Forces the app's `.dark` class on the canvas for the duration of the
 * story (the preview-level `theme` global control does not reliably reach
 * the iframe URL in this setup).
 */
function DarkCanvas({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => document.documentElement.classList.remove("dark");
  }, []);
  return <>{children}</>;
}

const meta: Meta = {
  title: "T3Team/Conversation/Working Row State Word (GHE #208)",
};
export default meta;
type Story = StoryObj;

export const StateWordEmphasis: Story = {
  name: "Live state words vs the 'Working' fallback (normal width)",
  render: () => (
    <div className="flex w-full flex-col items-center gap-8 px-12 py-10">{EmphasisContent}</div>
  ),
};

export const StateWordEmphasisDark: Story = {
  name: "Live state words vs the 'Working' fallback (dark)",
  render: () => (
    <DarkCanvas>
      <div className="flex w-full flex-col items-center gap-8 px-12 py-10">{EmphasisContent}</div>
    </DarkCanvas>
  ),
};

export const NarrowPanelClamp: Story = {
  name: "Narrow panel — the timer ellipsizes, it never hard-clips or wraps",
  render: () => (
    <div className="flex w-full flex-col items-center gap-8 px-12 py-10">{NarrowContent}</div>
  ),
};

export const NarrowPanelClampDark: Story = {
  name: "Narrow panel — the timer ellipsizes (dark)",
  render: () => (
    <DarkCanvas>
      <div className="flex w-full flex-col items-center gap-8 px-12 py-10">{NarrowContent}</div>
    </DarkCanvas>
  ),
};
