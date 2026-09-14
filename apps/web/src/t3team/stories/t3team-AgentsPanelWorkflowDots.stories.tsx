/**
 * The refined Agents-panel WORKFLOW display, with each sub-run dot reusing the
 * shared state-motion DOT LANGUAGE (GHE #201 follow-up) that the conversation
 * working row uses.
 *
 * WHAT THIS STORY SHOWS
 * ---------------------
 * The real `AgentsPanel` fed a mock `AgentPanelModel`: orchestration
 * workflows → phases → agent sub-runs. Every sub-run dot carries ITS OWN
 * runtime status and animates in the shared language — a running member pulses
 * warm, a waiting member breathes + rings, and a settled member reads a still
 * result (done = green, failed = red, stopped/idle = dim). The hierarchy is
 * workflow → phase → agent; per agent you get the live activity line,
 * model/effort, token + tool counts, and elapsed time.
 *
 * THEME: toggle the global `theme` control (top-right) between light and dark —
 * the panel and the dots both follow it (the dark result-state variants live in
 * t3team-agentsPanelDots.css; the live motion variants in t3team-index.css).
 *
 * The `liveStream` control keeps the running members' activity moving so the
 * warm "working" pulses stay alive across live-output events.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useState } from "react";

import type {
  AgentPanelModel,
  AgentPanelWorkflowGroup,
  RuntimeSubagent,
  SubagentUsage,
} from "@t3tools/client-runtime/state/subagentRuntime";

import { AgentsPanel } from "~/components/AgentsPanel";

const NOW = Date.now();
const ISO = (offsetSec: number) => new Date(NOW + offsetSec * 1000).toISOString();

function sub(
  overrides: Partial<RuntimeSubagent> & Pick<RuntimeSubagent, "id" | "title" | "status">,
): RuntimeSubagent {
  return {
    kind: "subagent",
    role: null,
    model: "Nexplore · Standard",
    effort: null,
    activationCount: 1,
    usage: null,
    progress: null,
    lastToolName: null,
    result: null,
    error: null,
    outputFile: null,
    parentAgentId: null,
    agentIndex: null,
    phaseIndex: null,
    phaseTitle: null,
    attempt: null,
    workflowName: null,
    phases: [],
    runHandles: null,
    recentActivity: [],
    firstSeenAt: ISO(0),
    startedAt: ISO(0),
    completedAt: null,
    updatedAt: ISO(30),
    ...overrides,
  };
}

const usage = (total: number, tools?: number): SubagentUsage => ({
  totalTokens: total,
  ...(tools !== undefined ? { toolUses: tools } : {}),
});

/** A live orchestration run: 3 phases across done / running / pending. */
const refactorRun: AgentPanelWorkflowGroup = {
  workflow: sub({
    id: "wf-refactor",
    kind: "workflow",
    title: "Refactor the auth module",
    status: "running",
    startedAt: ISO(-240),
  }),
  phases: [
    {
      index: 0,
      title: "Analyze",
      state: "done",
      activeCount: 0,
      settledCount: 1,
      members: [
        sub({
          id: "wf-refactor-a",
          title: "Map the auth surface",
          status: "completed",
          result: "Found 12 call sites; 3 need migration.",
          usage: usage(18400, 6),
          completedAt: ISO(-180),
        }),
      ],
    },
    {
      index: 1,
      title: "Implement",
      state: "running",
      activeCount: 2,
      settledCount: 0,
      members: [
        sub({
          id: "wf-refactor-b",
          title: "Extract the token provider",
          status: "running",
          progress: "Rewriting token refresh",
          lastToolName: "Edit",
          usage: usage(9600, 4),
          startedAt: ISO(-90),
        }),
        sub({
          id: "wf-refactor-c",
          title: "Port the legacy session codec",
          status: "waiting",
          startedAt: ISO(-75),
        }),
      ],
    },
    {
      index: 2,
      title: "Verify",
      state: "pending",
      activeCount: 0,
      settledCount: 0,
      members: [
        sub({
          id: "wf-refactor-d",
          title: "Run the auth regression suite",
          status: "pending",
          startedAt: null,
        }),
      ],
    },
  ],
  unphasedMembers: [],
};

/** A settled run that mixed success with a failure — the at-a-glance result. */
const sweepRun: AgentPanelWorkflowGroup = {
  workflow: sub({
    id: "wf-sweep",
    kind: "workflow",
    title: "Nightly regression sweep",
    status: "completed",
    startedAt: ISO(-3600),
    completedAt: ISO(-3000),
  }),
  phases: [
    {
      index: 0,
      title: "Baseline",
      state: "done",
      activeCount: 0,
      settledCount: 1,
      members: [
        sub({
          id: "wf-sweep-baseline",
          title: "Capture baseline metrics",
          status: "completed",
          usage: usage(4200, 2),
          completedAt: ISO(-3300),
        }),
      ],
    },
    {
      index: 1,
      title: "Diff",
      state: "done",
      activeCount: 0,
      settledCount: 1,
      members: [
        sub({
          id: "wf-sweep-diff",
          title: "Diff against baseline",
          status: "failed",
          error: "OOM on the fixture corpus (2.1 GB).",
          usage: usage(5100, 3),
          completedAt: ISO(-3100),
        }),
      ],
    },
  ],
  unphasedMembers: [],
};

const DIRECT: readonly RuntimeSubagent[] = [
  sub({ id: "direct-1", title: "Draft the release notes", status: "running", progress: "Writing" }),
  sub({
    id: "direct-2",
    title: "Summarize the PR comments",
    status: "idle",
    result: "Idle — resumed when the thread was closed.",
  }),
];

const LIVE_PROGRESS = [
  "Rewriting token refresh…",
  "Updating the session codec…",
  "Adding regression tests…",
  "Running the type checker…",
];

function buildModel(tick: number): AgentPanelModel {
  const runningProgress = LIVE_PROGRESS[tick % LIVE_PROGRESS.length] ?? "Rewriting token refresh…";
  const liveRefactor: AgentPanelWorkflowGroup = {
    ...refactorRun,
    phases: refactorRun.phases.map((phase): AgentPanelWorkflowGroup["phases"][number] =>
      phase.index === 1
        ? {
            ...phase,
            members: phase.members.map(
              (m): RuntimeSubagent =>
                m.id === "wf-refactor-b"
                  ? { ...m, progress: runningProgress, updatedAt: ISO(30 + tick) }
                  : m,
            ),
          }
        : phase,
    ),
  };
  const all = [
    ...refactorRun.phases.flatMap((p) => p.members),
    ...sweepRun.phases.flatMap((p) => p.members),
    ...DIRECT,
  ];
  return {
    workflows: [liveRefactor, sweepRun],
    directAgents: DIRECT,
    runningCount: all.filter((a) => a.status === "running").length,
    waitingCount: all.filter((a) => a.status === "waiting").length,
    idleCount: all.filter((a) => a.status === "idle").length,
    settledCount: all.filter((a) =>
      ["completed", "failed", "cancelled", "interrupted"].includes(a.status),
    ).length,
    totalTokens: all.reduce((sum, a) => sum + (a.usage?.totalTokens ?? 0), 0),
    hasAgents: true,
    liveCount: all.filter((a) => a.status === "running" || a.status === "waiting").length,
  };
}

function AgentsPanelWorkflowDots({ liveStream }: { liveStream: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!liveStream) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 2500);
    return () => window.clearInterval(id);
  }, [liveStream]);

  const model = buildModel(liveStream ? tick : 0);
  return (
    <div className="h-[560px] w-[420px] rounded-xl border border-border/70 bg-background p-2 shadow-sm">
      <AgentsPanel model={model} />
    </div>
  );
}

const meta = {
  title: "T3Team/Agents Panel/Workflow Dots — State Motion (GHE #201)",
  component: AgentsPanelWorkflowDots,
  args: { liveStream: false },
  argTypes: {
    liveStream: {
      control: "boolean",
      description:
        "Keep the running members' activity moving so the warm 'working' pulses stay alive.",
    },
  },
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof AgentsPanelWorkflowDots>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WorkflowHierarchy: Story = {
  name: "Workflow → phases → sub-run dots (mixed states)",
  args: { liveStream: false },
};

export const Live: Story = {
  name: "Live run (running members keep pulsing)",
  args: { liveStream: true },
};
