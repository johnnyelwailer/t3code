/* oxlint-disable t3code/no-native-title-tooltip -- The T3Team row story intentionally mirrors ThreadRow's native title tooltip. */
import type { Meta, StoryObj } from "@storybook/react";

import { ThreadStatusLabel } from "~/components/ThreadStatusIndicators";
import type { ThreadStatusPill } from "~/components/Sidebar.logic";
import {
  resolveProjectStatusIndicator,
  resolveThreadStatusPill,
} from "~/t3team/components/t3team-projectSidebarStatusPills";
import {
  activityPulseClass,
  resolveActivityPillDisplay,
} from "~/t3team/t3team-activityStateDisplay";
import type { ProjectThread } from "~/t3team/t3team-types";

/**
 * GHE #40 — live activity label states on the listed-thread surfaces.
 *
 * - the upstream/v2 `ThreadStatusLabel` (thread header + v2 sidebar row): the
 *   label replacing "Working", static "Working" fallback, flag off, idle/cleared
 * - the t3team sidebar dot (exact ThreadRow markup): label in the tooltip title
 * - the t3team project rollup: the most active thread's label bubbles to the
 *   project row
 *
 * Listed rows carry no thinking/writing word: that is derived from the open
 * thread's turn items and shows only on its working row (see the Working Row
 * stories). Under `prefers-reduced-motion` every pulse is disabled globally
 * (index.css media guard); the ReducedMotion story documents that.
 */

type T3Thread = Pick<ProjectThread, "status" | "activityLabel">;

const running: T3Thread = {
  status: "running",
  activityLabel: "editing the retry test",
};
const runningNoLabel: T3Thread = { status: "running" };
const completed: T3Thread = { status: "completed" };

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
        className={`inline-flex size-1.5 shrink-0 rounded-full ${pill.dotClass} ${activityPulseClass(pill)}`}
        title={resolveActivityPillDisplay(pill)}
      />
      <span className="min-w-0 truncate text-xs">Refactor the settings panel</span>
      <span className="ml-auto text-3xs text-muted-foreground/40">2m</span>
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
        className={`inline-flex size-[9px] shrink-0 rounded-full ${rollup.dotClass} ${activityPulseClass(rollup)}`}
      />
      <span className="truncate text-xs">Alpha — settings overhaul</span>
      <span className="ml-auto text-3xs text-muted-foreground/40">
        {resolveActivityPillDisplay(rollup)}
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
        <div className="flex items-center gap-2 text-3xs text-muted-foreground">
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

/** Active thread with a fresh label: the label replaces "Working". */
export const ActiveWithLiveLabel: Story = { args: { thread: running, flag: true } };

/** Active thread before the first LLM detail lands: the static "Working" word. */
export const ActiveStaticWorkingFallback: Story = { args: { thread: runningNoLabel, flag: true } };

/** Settings flag off: no LLM calls, the static "Working" word. */
export const SettingsFlagOff: Story = { args: { thread: running, flag: false } };

/** Idle/terminal: the label is cleared with the turn; settled status wins. */
export const IdleCleared: Story = { args: { thread: completed, flag: true } };

/**
 * Reduced motion: the same markup as the state stories; under
 * `prefers-reduced-motion` the index.css media guard disables the
 * status-pulse animations globally, so every pulsing dot in these stories
 * renders static. Verify light + dark in both motion modes.
 */
export const ReducedMotion: Story = {
  args: {
    thread: {
      status: "running",
      activityLabel: "tracing the error",
    },
    flag: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Every pill renders identically under prefers-reduced-motion: " +
          "the index.css `@media (prefers-reduced-motion: reduce)` guard sets " +
          "`animate-status-pulse` / `animate-pulse` to `animation: none`, so the " +
          "indicator is a static dot at its resting opacity. The word itself is " +
          "carried by text, so nothing is lost when the motion stops.",
      },
    },
  },
};
