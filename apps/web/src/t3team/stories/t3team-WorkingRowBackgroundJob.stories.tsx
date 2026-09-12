import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";

import type { BackgroundJobState } from "@t3tools/client-runtime/work-log/background-jobs";
import type { TurnId } from "@t3tools/contracts";
import { TimelineRowActivityCtx, WorkingTimelineRow } from "~/components/chat/MessagesTimeline";

/**
 * The working row when a backgrounded bash job outlives its turn — on the
 * REAL `WorkingTimelineRow` (components/chat/MessagesTimeline.tsx).
 *
 * The case this exists for: a bash call that yields a job handle SETTLES its
 * turn immediately. `isWorking` goes false, the status line has nothing true
 * left to say, and the thread used to render no live row at all while the
 * command ran on for minutes. The job line now takes the working-row slot
 * on its own, and shares it when a later turn is active.
 *
 * Both rows disappear by themselves: the indicator returns null once the last
 * job settles or passes its hard deadline, and the idle-only row goes with it
 * rather than leaving a bare separator.
 */

const NOW = Date.now();

const job = (overrides: Partial<BackgroundJobState> = {}): BackgroundJobState => ({
  jobId: "job_8865dcbe",
  startedAtMs: NOW - 190_000,
  deadlineMs: NOW + 1_610_000,
  state: "running",
  ...overrides,
});

function Row({
  isWorking,
  backgroundJobs,
  workingStepLabel = null,
}: {
  isWorking: boolean;
  backgroundJobs: readonly BackgroundJobState[];
  workingStepLabel?: string | null;
}) {
  return (
    <TimelineRowActivityCtx.Provider
      value={{
        isWorking,
        isPreparingWorktree: false,
        isCompacting: false,
        isRevertingCheckpoint: false,
        latestTurnId: "turn-background-job" as TurnId,
        workingStepLabel,
        activeAgents: [],
        backgroundJobs,
        onOpenAgents: () => {},
        threadActivityState: isWorking ? "thinking" : null,
      }}
    >
      <WorkingTimelineRow
        row={{
          kind: "working",
          id: "working-background-job-row",
          createdAt: isWorking ? new Date(NOW - 12_000).toISOString() : null,
        }}
      />
    </TimelineRowActivityCtx.Provider>
  );
}

/** The production row wrapper (MessagesTimeline renderItem). */
function RowPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[520px] rounded-lg border border-border/50 bg-card p-2">
      <div className="mx-auto w-full min-w-0 max-w-3xl overflow-x-clip" data-timeline-root="true">
        {children}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-[560px] rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-3 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

const Content = (
  <>
    <Card title="Turn settled, job still running — the job line IS the row">
      <RowPanel>
        <Row isWorking={false} backgroundJobs={[job()]} />
      </RowPanel>
    </Card>
    <Card title="Two jobs — the count pluralizes and the age tracks the OLDEST">
      <RowPanel>
        <Row
          isWorking={false}
          backgroundJobs={[job(), job({ jobId: "job_daf11859", startedAtMs: NOW - 20_000 })]}
        />
      </RowPanel>
    </Card>
    <Card title="A later turn is active — the job line sits under the status line, never replaces it">
      <RowPanel>
        <Row
          isWorking
          backgroundJobs={[job()]}
          workingStepLabel="Refactoring the settings panel"
        />
      </RowPanel>
    </Card>
    <Card title="Last job settled — the whole row goes, no bare separator left behind">
      <RowPanel>
        <Row isWorking={false} backgroundJobs={[job({ state: "finished" })]} />
      </RowPanel>
    </Card>
  </>
);

/** Forces the app's `.dark` class on the canvas for the story's lifetime. */
function DarkCanvas({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => document.documentElement.classList.remove("dark");
  }, []);
  return <>{children}</>;
}

const meta: Meta = {
  title: "T3Team/Conversation/Working Row — Background Job",
};
export default meta;
type Story = StoryObj;

export const BackgroundJobRow: Story = {
  name: "A running background job keeps the thread alive",
  render: () => (
    <div className="flex w-full flex-col items-center gap-8 px-12 py-10">{Content}</div>
  ),
};

export const BackgroundJobRowDark: Story = {
  name: "A running background job keeps the thread alive (dark)",
  render: () => (
    <DarkCanvas>
      <div className="flex w-full flex-col items-center gap-8 px-12 py-10">{Content}</div>
    </DarkCanvas>
  ),
};
