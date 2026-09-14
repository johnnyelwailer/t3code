/**
 * UX baseline for the t3team workflow "agents panel" — the live reproduction of the 2026-09-08
 * noise complaint against `nexi-ghe-hourly-triage`.
 *
 * Every story renders the real production components (`T3TeamWorkflowShapeLiveCard`,
 * `AgentsPanel`, `T3TeamAgentsPanelForkSection`, `T3TeamActiveWorkflowDock`) driven by mock
 * data. No behaviour is forked into a story — a variant designed in phase 2 must land in the
 * production module and re-render here.
 *
 * Story list:
 *  - `RealisticGheTriage` — the full lane (panel + live card + composer dock) in one
 *    data-faithful constellation, the primary story to iterate against.
 *  - Card states: `CardActiveAgentStep`, `CardFailedStep`, `CardNeedsAttention`,
 *    `CardSettled`, `CardLoopGrouping` (GHE #403 §5 grouping).
 */
import type { Meta, StoryObj } from "@storybook/react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import type {
  AgentPanelModel,
  AgentPanelWorkflowGroup,
  RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";

import { AgentsPanel } from "~/components/AgentsPanel";
import { T3TeamWorkflowShapeLiveCard } from "~/t3team/chat/t3team-messageShapeCardLive";
import { T3TeamAgentsPanelForkSection } from "~/t3team/chat/t3team-AgentsPanelForkSection";
import {
  T3TeamActiveWorkflowDock,
  type T3TeamActiveWorkflowDockItem,
} from "~/t3team/chat/t3team-activeWorkflowDock";
import type { T3TeamWorkflowStepEntry } from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import type { ProjectThread } from "~/t3team/t3team-types";

/* ------------------------------ shared mock data ------------------------------ */

/** The run the user screenshotted: one recipe, one phase, one repeated agent call. */
const shape = {
  name: "nexi-ghe-hourly-triage",
  description: "Triage open GHE issues once an hour: read, classify, post, wait, repeat.",
  phases: [{ title: "Hourly cycle" }],
  steps: [
    { phase: "Hourly cycle", kind: "agent", label: "Hourly GHE triage cycle" },
    { phase: "Hourly cycle", kind: "act", label: "Post triage summary" },
  ],
  workflowRunId: "run-triage-1",
} as const;

const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000;

let seq = 0;
function step(
  patch: Partial<T3TeamWorkflowStepEntry> & Pick<T3TeamWorkflowStepEntry, "stepKind">,
): T3TeamWorkflowStepEntry {
  seq += 1;
  return {
    stepId: `run-triage-1:${seq}`,
    seq,
    phase: "started",
    updatedAt: isoAgo(5_000),
    ...patch,
  } as T3TeamWorkflowStepEntry;
}

function makeAgent(overrides: Partial<RuntimeSubagent>): RuntimeSubagent {
  return {
    id: "agent-1",
    kind: "subagent",
    title: "Agent",
    role: null,
    model: "gpt-5.2",
    effort: "high",
    status: "running",
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
    firstSeenAt: isoAgo(2 * MIN),
    startedAt: isoAgo(83_000), // the "1m 23s" from the screenshot
    completedAt: null,
    updatedAt: isoAgo(5_000),
    ...overrides,
  };
}

const noop = () => undefined;

/* ------------------------------- card state stories ------------------------------ */

function CardStory({
  shape: s,
  progress,
  ...rest
}: Parameters<typeof T3TeamWorkflowShapeLiveCard>[0]) {
  return (
    <div style={{ width: 560 }}>
      <T3TeamWorkflowShapeLiveCard shape={s} progress={progress} {...rest} />
    </div>
  );
}

/** One agent step in flight; the child thread's status word renders in the row's trailing slot. */
export const CardActiveAgentStep: Story = {
  args: {
    shape,
    progress: {
      runId: "run-triage-1",
      steps: [
        step({
          stepKind: "thread.turn",
          phase: "started",
          detail: "Hourly GHE triage cycle",
          workflowPhase: "Hourly cycle",
          projectId: "project-1",
          threadId: "thread-triage",
          updatedAt: isoAgo(83_000),
        }),
      ],
      run: null,
    },
    childStatuses: { "thread-triage": "Working · triaging issues" },
  },
};

/** A failed step mid-run: red row with the error detail, run still "running". */
export const CardFailedStep: Story = {
  args: {
    shape,
    progress: {
      runId: "run-triage-1",
      steps: [
        step({
          stepKind: "thread.turn",
          phase: "failed",
          detail: "Hourly GHE triage cycle",
          workflowPhase: "Hourly cycle",
          error: "ghe: rate limit exceeded",
        }),
      ],
      run: null,
    },
  },
};

/** Self-heal step in its terminal-failed form: the "Needs attention" strip replaces the raw step row. */
export const CardNeedsAttention: Story = {
  args: {
    shape,
    progress: {
      runId: "run-triage-1",
      steps: [
        step({
          stepKind: "thread.turn",
          phase: "failed",
          detail: "Hourly GHE triage cycle",
          workflowPhase: "Hourly cycle",
          error: "workflow crashed",
        }),
        step({
          stepKind: "workflow.self-heal",
          phase: "failed",
          detail: "Repairing workflow",
          error: "repair attempt failed",
        }),
      ],
      run: null,
    },
  },
};

/** Settled run: completed banner + outcome line, plan rows read as history. */
export const CardSettled: Story = {
  args: {
    shape,
    progress: {
      runId: "run-triage-1",
      steps: [
        step({
          stepKind: "thread.turn",
          phase: "completed",
          detail: "Hourly GHE triage cycle",
          workflowPhase: "Hourly cycle",
          durationMs: 41_000,
        }),
        step({ stepKind: "tool.call", phase: "completed", detail: "Post triage summary" }),
      ],
      run: { phase: "completed" },
    },
    outcomeSummary: "12 issues triaged · 0 blockers",
  },
};

/**
 * Loop grouping: one plan row + 14 same-label dynamic repeats fold into a single collapsible
 * group ("15/15", capped at 10 visible rows with a "Show all 15" expander — GHE #403 §5).
 */
export const CardLoopGrouping: Story = {
  args: {
    shape,
    progress: {
      runId: "run-triage-1",
      steps: [
        ...Array.from({ length: 15 }, (_, i) =>
          step({
            stepKind: "thread.turn",
            phase: i === 14 ? "started" : "completed",
            detail: "Hourly GHE triage cycle",
            workflowPhase: "Hourly cycle",
            ...(i === 14 ? {} : { durationMs: 38_000 }),
          }),
        ),
      ],
      run: null,
    },
  },
};

/* ---------------------------- realistic constellation ---------------------------- */

/**
 * The live GHE hourly-triage lane, data-faithful to the user's real panel: a run titled
 * "Recipe workflows", one phase "Hourly cycle", the agent step "Hourly GHE triage cycle"
 * in flight ~3m 57s, sub-run thread "Hourly cycle" up 45s, and the composer dock carrying
 * the same run. All three surfaces render from the real production components. The fork
 * section is UNfiltered (production behaviour today — the dedup filter exists in
 * `t3team-AgentsPanelForkSection.logic.ts` but is not wired into ChatView yet), so the
 * duplication the user sees is reproduced here for iteration.
 */
const gheShape = {
  name: "Recipe workflows",
  description: "GHE hourly triage — read open issues, classify, file, report.",
  phases: [{ title: "Hourly cycle" }],
  steps: [
    { phase: "Hourly cycle", kind: "agent", label: "Hourly GHE triage cycle" },
    { phase: "Hourly cycle", kind: "act", label: "File triage report" },
  ],
  workflowRunId: "run-triage-1",
} as const;

const GHE_ELAPSED_MS = 237_000; // 3m 57s — the age shown in the user's panel

const gheAgent = makeAgent({
  id: "agent-ghe-cycle",
  kind: "workflow_agent",
  title: "Hourly GHE triage cycle",
  parentAgentId: "wf-ghe",
  phaseIndex: 0,
  phaseTitle: "Hourly cycle",
  progress: "Fetching open issues",
  startedAt: isoAgo(GHE_ELAPSED_MS),
  updatedAt: isoAgo(15_000),
});

function ghePanelModel(): AgentPanelModel {
  const group: AgentPanelWorkflowGroup = {
    workflow: makeAgent({
      id: "wf-ghe",
      kind: "workflow",
      title: "Recipe workflows",
      workflowName: "Recipe workflows",
      runHandles: { runId: "run-triage-1" },
      phases: [{ index: 0, title: "Hourly cycle" }],
      startedAt: isoAgo(GHE_ELAPSED_MS),
    }),
    phases: [
      {
        index: 0,
        title: "Hourly cycle",
        members: [gheAgent],
        state: "running",
        activeCount: 1,
        settledCount: 0,
      },
    ],
    unphasedMembers: [],
  };
  return {
    workflows: [group],
    directAgents: [],
    runningCount: 1,
    waitingCount: 0,
    idleCount: 0,
    settledCount: 0,
    totalTokens: 0,
    hasAgents: true,
    liveCount: 1,
  };
}

const gheChildThread: ProjectThread = {
  id: "thread-triage",
  projectId: "project-1",
  parentThreadId: "thread-root",
  title: "Hourly cycle",
  status: "running",
  messageCount: 2,
  lastMessageAt: isoAgo(12_000),
  createdAt: isoAgo(45_000), // "running 45s · just now" in the user's panel
};

const gheDockItem: T3TeamActiveWorkflowDockItem = {
  runId: "run-triage-1",
  messageId: "msg-ghe" as T3TeamActiveWorkflowDockItem["messageId"],
  name: "Recipe workflows",
  summaries: ["Active: Hourly GHE triage cycle"],
};

function gheForkSection() {
  return (
    <T3TeamAgentsPanelForkSection
      childThreadsByParentId={new Map([["thread-root", [gheChildThread]]])}
      rootThreadId="thread-root"
      onOpenChildThread={noop}
      workflowRuns={[gheDockItem]}
      onOpenWorkflowRun={noop}
    />
  );
}

const gheProgress = {
  runId: "run-triage-1",
  steps: [
    step({
      stepKind: "thread.turn",
      phase: "started",
      detail: "Hourly GHE triage cycle",
      workflowPhase: "Hourly cycle",
      projectId: "project-1",
      threadId: "thread-triage",
      updatedAt: isoAgo(GHE_ELAPSED_MS),
    }),
  ],
  run: null,
};

const gheChildStatuses: Record<string, string> = {
  "thread-triage": "Working · fetching open issues",
};

/** Full lane: agents panel (right rail) + live card + composer dock, one consistent run. */
export const RealisticGheTriage: Story = {
  args: { shape: gheShape, progress: gheProgress, childStatuses: gheChildStatuses },
  render: () => (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <div style={{ width: 420, height: 560 }}>
        <AgentsPanel model={ghePanelModel()} forkSection={gheForkSection()} />
      </div>
      <div style={{ width: 560 }}>
        <T3TeamWorkflowShapeLiveCard
          shape={gheShape}
          progress={gheProgress}
          childStatuses={gheChildStatuses}
        />
        <div style={{ marginTop: 8 }}>
          <T3TeamActiveWorkflowDock items={[gheDockItem]} onOpen={noop} />
        </div>
      </div>
    </div>
  ),
};

/* -------------------------- density variant prototypes -------------------------- */
/*
 * Three density proposals for the panel's expanded workflow section.
 * Each replaces the current run → phase → agent tree with a calmer presentation.
 * These are design prototypes rendered in the story only; the chosen variant
 * will be implemented in AgentsPanel.tsx production code.
 */

import type { ReactNode } from "react";

/** Shared lane layout: panel (420px) | card + dock (560px). */
function LaneLayout({ panel, label }: { panel: ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div
        style={{
          width: 420,
          border: "1px solid oklch(0.85 0 0 / 0.3)",
          borderRadius: 12,
          padding: 8,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "oklch(0.55 0 0)",
            marginBottom: 8,
            padding: "0 6px",
          }}
        >
          {label}
        </div>
        {panel}
      </div>
      <div style={{ width: 560 }}>
        <T3TeamWorkflowShapeLiveCard
          shape={gheShape}
          progress={gheProgress}
          childStatuses={gheChildStatuses}
        />
        <div style={{ marginTop: 8 }}>
          <T3TeamActiveWorkflowDock items={[gheDockItem]} onOpen={noop} />
        </div>
      </div>
    </div>
  );
}

/** Format elapsed seconds for static display in variants. */
function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

/* ---- Variant A: Adaptive tree ---- */
/**
 * Keeps the run → agent structure but auto-collapses levels that add no info:
 * - Single phase: phase rail header hidden, agents render directly under run
 * - "0/1 settled" counter hidden when nothing is settled
 * - Model/effort hidden when only 1 agent in the run
 * Result: 2 lines (run header + agent row) instead of 4.
 */
function VariantA_AdaptiveTree() {
  const elapsed = fmtElapsed(GHE_ELAPSED_MS);
  return (
    <div className="rounded-lg border border-border/50 bg-card/30 p-1.5">
      {/* Run header — just the name, NO status dot (children carry status) */}
      <div className="flex items-center gap-2 px-1.5 py-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
          Recipe workflows
        </span>
      </div>
      {/* Agent row (phase header skipped — single phase) */}
      <div className="ml-3 rounded-md px-1.5 py-1">
        <div className="group flex items-center gap-2 hover:bg-muted/35 cursor-pointer">
          <span className="size-2.5 rounded-full bg-success" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            Hourly GHE triage cycle
          </span>
          <span className="shrink-0 font-mono text-[.7rem] text-muted-foreground tabular-nums">
            {elapsed}
          </span>
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5" />
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">Fetching open issues</div>
      </div>
    </div>
  );
}

/* ---- Variant B: One-line summary ---- */
/**
 * For a single run, the panel renders one flat row.
 * No phase, no agent sub-row, no model. The card carries all detail.
 * The panel earns tree structure only with ≥ 2 runs or ≥ 2 agents.
 * Result: 1 line.
 */
function VariantB_Panel() {
  const elapsed = fmtElapsed(GHE_ELAPSED_MS);
  return (
    <div className="rounded-lg border border-border/50 bg-card/30 p-1.5">
      <div className="group flex items-center gap-2 px-1.5 py-1.5 hover:bg-muted/35 cursor-pointer">
        <span className="size-2 rounded-full bg-success animate-pulse" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">Recipe workflows</span>
        <span className="shrink-0 rounded-sm bg-success/15 px-1.5 py-0.5 text-[.65rem] font-medium text-success">
          Working
        </span>
        <span className="shrink-0 font-mono text-[.7rem] text-muted-foreground tabular-nums">
          {elapsed}
        </span>
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5" />
      </div>
    </div>
  );
}

/* ---- Variant C: Counts only ---- */
/**
 * The panel is a status strip, not a tree.
 * One compact badge per run: name + agent count + elapsed.
 * No per-agent detail. Click opens the card.
 * Result: 1 compact line, smallest footprint.
 */
function VariantC_Panel() {
  const elapsed = fmtElapsed(GHE_ELAPSED_MS);
  return (
    <div className="rounded-lg border border-border/50 bg-card/30 p-1.5">
      <div className="group flex items-center gap-1.5 px-1.5 py-1 hover:bg-muted/35 cursor-pointer">
        <span className="size-2 rounded-full bg-success animate-pulse" />
        <span className="text-xs font-medium">Recipe workflows</span>
        <span className="text-[.65rem] text-muted-foreground">·</span>
        <span className="text-[.7rem] text-muted-foreground tabular-nums">1 agent</span>
        <span className="text-[.65rem] text-muted-foreground">·</span>
        <span className="text-[.7rem] text-muted-foreground tabular-nums">{elapsed}</span>
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5" />
      </div>
    </div>
  );
}

/* ---------------------------------- stories ---------------------------------- */

export const VariantA_Adaptive: Story = {
  args: { shape: gheShape, progress: gheProgress, childStatuses: gheChildStatuses },
  render: () => <LaneLayout label="Variant A — Adaptive tree" panel={<VariantA_AdaptiveTree />} />,
};

export const VariantB_OneLine: Story = {
  args: { shape: gheShape, progress: gheProgress, childStatuses: gheChildStatuses },
  render: () => <LaneLayout label="Variant B — One-line summary" panel={<VariantB_Panel />} />,
};

export const VariantC_CountsOnly: Story = {
  args: { shape: gheShape, progress: gheProgress, childStatuses: gheChildStatuses },
  render: () => <LaneLayout label="Variant C — Counts only" panel={<VariantC_Panel />} />,
};

/**
 * All three variants in one scrollable row so they can be compared
 * side by side against the same card. Each variant gets its own panel;
 * the card+dock is shared on the right and the row scrolls horizontally
 * when the viewport is too narrow.
 */
export const AllVariants_SideBySide: Story = {
  args: { shape: gheShape, progress: gheProgress, childStatuses: gheChildStatuses },
  render: () => (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        overflowX: "auto",
        paddingBottom: 8,
        width: "100%",
      }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", minWidth: 0 }}>
        <div
          style={{
            width: 420,
            border: "1px solid oklch(0.85 0 0 / 0.3)",
            borderRadius: 12,
            padding: 8,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "oklch(0.55 0 0)",
              marginBottom: 8,
              padding: "0 6px",
            }}
          >
            A — Adaptive tree
          </div>
          <VariantA_AdaptiveTree />
        </div>
        <div
          style={{
            width: 420,
            border: "1px solid oklch(0.85 0 0 / 0.3)",
            borderRadius: 12,
            padding: 8,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "oklch(0.55 0 0)",
              marginBottom: 8,
              padding: "0 6px",
            }}
          >
            B — One-line summary
          </div>
          <VariantB_Panel />
        </div>
        <div
          style={{
            width: 420,
            border: "1px solid oklch(0.85 0 0 / 0.3)",
            borderRadius: 12,
            padding: 8,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "oklch(0.55 0 0)",
              marginBottom: 8,
              padding: "0 6px",
            }}
          >
            C — Counts only
          </div>
          <VariantC_Panel />
        </div>
      </div>
      <div style={{ width: 560, minWidth: 560 }}>
        <T3TeamWorkflowShapeLiveCard
          shape={gheShape}
          progress={gheProgress}
          childStatuses={gheChildStatuses}
        />
        <div style={{ marginTop: 8 }}>
          <T3TeamActiveWorkflowDock items={[gheDockItem]} onOpen={noop} />
        </div>
      </div>
    </div>
  ),
};

/* ---- Complex multi-agent workflow example ---- */
// A realistic 4-agent orchestration with mixed statuses:
// - 2 phases: "Triage & Plan" + "Implementation"
// - 4 agents: 1 settled, 1 failed, 1 working, 1 needs-attention
const COMPLEX_ELAPSED_MS = 42 * 60_000 + 18_000; // 42m 18s

function ComplexRow({
  label,
  status,
  dotClass,
  elapsed,
  indented,
}: {
  label: string;
  status: string;
  dotClass: string;
  elapsed?: string;
  indented?: boolean;
}) {
  const statusBadge =
    status === "Failed"
      ? "bg-destructive/15 text-destructive"
      : status === "Needs attention"
        ? "bg-amber-500/15 text-amber-600"
        : "bg-success/15 text-success";
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/35 cursor-pointer",
        indented && "ml-3",
      )}
    >
      <span className={cn("size-2.5 shrink-0 rounded-full", dotClass)} />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{label}</span>
      <span className={cn("shrink-0 rounded-sm px-1 py-px text-[.6rem] font-medium", statusBadge)}>
        {status}
      </span>
      {elapsed && (
        <span className="shrink-0 font-mono text-[.65rem] text-muted-foreground tabular-nums">
          {elapsed}
        </span>
      )}
      <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5" />
    </div>
  );
}

function ComplexAdaptiveTree() {
  return (
    <div className="rounded-lg border border-border/50 bg-card/30 p-1.5">
      <div className="flex items-center gap-2 px-1.5 py-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
          nexi-ghe-triage-orchestrator
        </span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/70">
          1/4 settled
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-1.5 py-0.5">
        <span className="text-[10px] font-medium tracking-wide text-muted-foreground/80 uppercase">
          Triage & Plan
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/50">
          0 active · 1 done · 1 failed
        </span>
      </div>
      <ComplexRow
        label="GHE issue scanner"
        status="Done"
        dotClass="bg-success"
        elapsed="4m 12s"
        indented
      />
      <ComplexRow
        label="Triage report writer"
        status="Failed"
        dotClass="bg-destructive"
        elapsed="2m 03s"
        indented
      />
      <div className="mt-1 flex items-center gap-1.5 px-1.5 py-0.5">
        <span className="text-[10px] font-medium tracking-wide text-muted-foreground/80 uppercase">
          Implementation
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/50">2 active · 0 done</span>
      </div>
      <ComplexRow
        label="Fix provider death settle"
        status="Working"
        dotClass="bg-success animate-pulse"
        elapsed="38m 10s"
        indented
      />
      <ComplexRow
        label="Refactor tool broker"
        status="Needs attention"
        dotClass="bg-amber-500"
        elapsed="12m 44s"
        indented
      />
    </div>
  );
}

function ComplexOneLine() {
  return (
    <div className="rounded-lg border border-border/50 bg-card/30 p-1.5 space-y-0.5">
      <ComplexRow
        label="nexi-ghe-triage-orchestrator"
        status="Working"
        dotClass="bg-success animate-pulse"
        elapsed={fmtElapsed(COMPLEX_ELAPSED_MS)}
        indented={false}
      />
      <div
        className="ml-3 flex gap-2.5 text-[10px] text-muted-foreground/70"
        style={{ marginInlineStart: 6 }}
      >
        <span className="text-success">● 2 working</span>
        <span className="text-destructive">✕ 1 failed</span>
        <span className="text-amber-600">⚠ 1 needs attention</span>
      </div>
      <div
        className="ml-3 flex gap-2.5 text-[10px] text-muted-foreground/70"
        style={{ marginInlineStart: 6 }}
      >
        <span className="text-success">● 2 working</span>
        <span className="text-destructive">✕ 1 failed</span>
        <span className="text-amber-600">⚠ 1 needs attention</span>
      </div>
    </div>
  );
}

function ComplexCounts() {
  return (
    <div className="rounded-lg border border-border/50 bg-card/30 p-1.5 space-y-0.5">
      <div className="group flex items-center gap-1.5 px-1.5 py-1 hover:bg-muted/35 cursor-pointer">
        <span className="size-2 rounded-full bg-success animate-pulse" />
        <span className="text-xs font-medium">nexi-ghe-triage-orchestrator</span>
        <span className="text-[.65rem] text-muted-foreground">·</span>
        <span className="text-[.7rem] text-muted-foreground tabular-nums">4 agents</span>
        <span className="text-[.65rem] text-muted-foreground">·</span>
        <span className="text-[.7rem] text-muted-foreground tabular-nums">
          {fmtElapsed(COMPLEX_ELAPSED_MS)}
        </span>
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="ml-3 flex gap-2 text-[10px]">
        <span className="text-destructive">✕ 1</span>
        <span className="text-amber-600">⚠ 1</span>
        <span className="text-success">● 2</span>
      </div>
    </div>
  );
}

export const AllVariants_Complex: Story = {
  args: { shape: gheShape, progress: gheProgress, childStatuses: gheChildStatuses },
  render: () => (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        overflowX: "auto",
        paddingBottom: 8,
        width: "100%",
      }}
    >
      <div
        style={{
          width: 420,
          border: "1px solid oklch(0.85 0 0 / 0.3)",
          borderRadius: 12,
          padding: 8,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "oklch(0.55 0 0)",
            marginBottom: 8,
            padding: "0 6px",
          }}
        >
          A — Adaptive tree (4 agents, 2 phases)
        </div>
        <ComplexAdaptiveTree />
      </div>
      <div
        style={{
          width: 420,
          border: "1px solid oklch(0.85 0 0 / 0.3)",
          borderRadius: 12,
          padding: 8,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "oklch(0.55 0 0)",
            marginBottom: 8,
            padding: "0 6px",
          }}
        >
          B — One-line (4 agents, 2 phases)
        </div>
        <ComplexOneLine />
      </div>
      <div
        style={{
          width: 420,
          border: "1px solid oklch(0.85 0 0 / 0.3)",
          borderRadius: 12,
          padding: 8,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "oklch(0.55 0 0)",
            marginBottom: 8,
            padding: "0 6px",
          }}
        >
          C — Counts only (4 agents, 2 phases)
        </div>
        <ComplexCounts />
      </div>
    </div>
  ),
};

/* ------------------------------------ meta ------------------------------------- */

/**
 * Card stories bind to the width wrapper (Storybook spreads the args over it);
 * `RealisticGheTriage` and the variant stories use their own `render` and ignore the binding.
 */
const meta = {
  title: "T3Team/Chat/WorkflowAgentsPanelUx",
  component: CardStory,
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
