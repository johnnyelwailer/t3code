import type { Meta, StoryObj } from "@storybook/react";

import { ThreadStatusLabel } from "~/components/ThreadStatusIndicators";
import type { ThreadStatusPill } from "~/components/Sidebar.logic";
import {
  resolveProjectStatusIndicator,
  resolveThreadStatusPill,
} from "~/t3team/components/t3team-projectSidebarStatusPills";
import type { ProjectThread } from "~/t3team/t3team-types";

/**
 * GHE #40 — live activity label states.
 *
 * One story file for every surface the label reaches:
 * - the upstream/v2 `ThreadStatusLabel` (thread header + v2 sidebar row): live label,
 *   static "Working" fallback, flag off, idle/cleared
 * - the t3team sidebar dot (exact ThreadRow markup): live label in the tooltip title,
 *   static dot when the flag is off
 * - the t3team project rollup: the most active thread's label bubbles to the project row
 */

type T3Thread = Pick<ProjectThread, "status" | "activityLabel">;

const running: T3Thread = { status: "running", activityLabel: "Reading contracts" };
const runningNoLabel: T3Thread = { status: "running" };
const completed: T3Thread = { status: "completed" };

const workingPill: ThreadStatusPill = {
  label: "Working",
  colorClass: "text-sky-600 dark:text-sky-300/80",
  dotClass: "bg-sky-500 dark:bg-sky-300/80",
  pulse: true,
};

function upstreamPill(t3Pill: {
  label: string;
  activityLabel?: string;
  colorClass: string;
  dotClass: string;
  pulse: boolean;
}): ThreadStatusPill {
  return {
    label: t3Pill.label as ThreadStatusPill["label"],
    ...(t3Pill.activityLabel ? { activityLabel: t3Pill.activityLabel } : {}),
    colorClass: t3Pill.colorClass,
    dotClass: t3Pill.dotClass,
    pulse: t3Pill.pulse,
  };
}

function StoryFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-sidebar p-8">
      {children}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-[340px] rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-3 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

/** Exact pill markup from `t3team-ProjectSidebarThreadRow`. */
function T3SidebarDot({ thread, flag }: { thread: T3Thread; flag: boolean }) {
  const pill = resolveThreadStatusPill(thread, { activityLabelsEnabled: flag });
  if (!pill) return null;
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-accent/40 px-2 py-1.5">
      <span
        className={`inline-flex size-1.5 shrink-0 rounded-full ${pill.dotClass} ${
          pill.pulse ? "animate-pulse" : ""
        }`}
        title={pill.activityLabel ?? pill.label}
      />
      <span className="min-w-0 truncate text-xs">Refactor the settings panel</span>
      <span className="ml-auto text-[10px] text-muted-foreground/40">2m</span>
    </div>
  );
}

function ProjectRollupRow({ threads, flag }: { threads: T3Thread[]; flag: boolean }) {
  const rollup = resolveProjectStatusIndicator(threads as ProjectThread[], {
    activityLabelsEnabled: flag,
  });
  if (!rollup) return null;
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-accent/40 px-2 py-1.5">
      <span
        className={`inline-flex size-[9px] shrink-0 rounded-full ${rollup.dotClass} ${
          rollup.pulse ? "animate-pulse" : ""
        }`}
      />
      <span className="truncate text-xs">Alpha — settings overhaul</span>
      <span className="ml-auto text-[10px] text-muted-foreground/40">
        {rollup.activityLabel ?? rollup.label}
      </span>
    </div>
  );
}

function ActivityLabelPillStory({ thread, flag }: { thread: T3Thread; flag: boolean }) {
  const t3Pill = resolveThreadStatusPill(thread, { activityLabelsEnabled: flag });
  return (
    <StoryFrame>
      <Card title="Thread header / v2 sidebar row (ThreadStatusLabel)">
        <div className="flex items-center justify-between rounded-md bg-accent/40 px-2 py-1.5">
          <span className="truncate text-xs">Refactor the settings panel</span>
          {t3Pill ? <ThreadStatusLabel status={upstreamPill(t3Pill)} /> : null}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>compact:</span>
          {t3Pill ? <ThreadStatusLabel status={upstreamPill(t3Pill)} compact /> : null}
        </div>
      </Card>
      <Card title="T3Team sidebar thread row (dot + tooltip title)">
        <T3SidebarDot thread={thread} flag={flag} />
      </Card>
      <Card title="T3Team project rollup (most active thread's label)">
        <ProjectRollupRow
          threads={[{ status: "completed" }, thread, { status: "idle" }]}
          flag={flag}
        />
      </Card>
    </StoryFrame>
  );
}

const meta = {
  title: "T3Team/Sidebar/Activity Label (GHE #40)",
  component: ActivityLabelPillStory,
} satisfies Meta<typeof ActivityLabelPillStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Active thread with a fresh label: "Reading contracts" replaces static "Working". */
export const ActiveWithLiveLabel: Story = { args: { thread: running, flag: true } };

/** Active thread before the first label lands (or right after a clear): static "Working". */
export const ActiveStaticWorkingFallback: Story = {
  args: { thread: runningNoLabel, flag: true },
};

/** Settings flag off: generation is skipped server-side; the pill stays static "Working". */
export const SettingsFlagOff: Story = { args: { thread: running, flag: false } };

/** Idle/terminal: the label is cleared with the pending generation; settled status wins. */
export const IdleCleared: Story = { args: { thread: completed, flag: true } };
