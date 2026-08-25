import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useRef, useState } from "react";

import type { TurnId } from "@t3tools/contracts";
import { TimelineRowActivityCtx, WorkingTimelineRow } from "~/components/chat/MessagesTimeline";
import type { ActiveAgentEntry } from "~/t3team/chat/t3team-activeAgentsIndicator";

/**
 * DESIGN → INTEGRATION (GHE #201): the active-agents indicator in the
 * CONVERSATION working row ("Working for 2m · <label>", under the messages).
 *
 * This story mounts the REAL `WorkingTimelineRow` from
 * components/chat/MessagesTimeline.tsx and feeds it REAL data through the
 * same seam the app uses: `TimelineRowActivityCtx.activeAgents` —
 * `mergeActiveAgentsAndChildren` output (running child threads + live
 * in-thread subagents) — with `workingStepLabel` and `onOpenAgents`. The
 * dots, the hover-flipped step label and all animation CSS
 * (`t3team-aci-*` in t3team-index.css) are the real production components;
 * only the agent list and its events are simulated (a stand-in for the
 * child-thread store / subagent runtime updates).
 *
 * Behavior:
 * - Merged source: child threads ("sub-runs") + subagents, active only.
 * - Dots are COMPLETELY STILL when idle. On an agent's live-output event
 *   (activityKey change — real trigger: childStatusUpdatedAt / lastMessageAt
 *   / activityLabel store updates, or subagent updatedAt / progress) that
 *   dot performs ONE slow pendulum move, then settles.
 * - Hover a dot → it scales 1.7x (no pill) and the EXISTING step label
 *   flips to that agent's live status (unhover flips back). Nothing is
 *   appended; the label is debounced 900ms and switches with a sequential
 *   FLIP (old text fully out, then new text in).
 * - Group click → Agents panel (real app: addAgentsSurface; here: the demo
 *   panel under the row).
 */

// ---------------------------------------------------------------------------
// Mock data + simulation
// ---------------------------------------------------------------------------

type SeedAgent = {
  readonly title: string;
  readonly statusLabel: string;
  readonly source: "child" | "subagent";
};

const CHILD_SEEDS: readonly SeedAgent[] = [
  { title: "Fix the flaky retry test", statusLabel: "Editing tests", source: "child" },
  { title: "Draft the release notes", statusLabel: "Reading contracts", source: "child" },
  { title: "Review the provider registry diff", statusLabel: "Working", source: "child" },
  { title: "Scrape the docs site", statusLabel: "Running build", source: "child" },
  { title: "Split the billing service", statusLabel: "Planning steps", source: "child" },
  { title: "Triage the crash reports", statusLabel: "Searching logs", source: "child" },
];

const SUBAGENT_SEEDS: readonly SeedAgent[] = [
  { title: "Review release risks", statusLabel: "Checking API compatibility", source: "subagent" },
  { title: "Assess rollout risk", statusLabel: "Reading migration plan", source: "subagent" },
];

const LABELS = [
  "Refactoring the settings panel",
  "Extracting the settings schema",
  "Running the migration checks",
  "Cleaning up unused exports",
];

/** One entry per active agent; `activityKey` mutates on every simulated event. */
function buildEntries(
  childCount: number,
  subagentCount: number,
  eventTicks: ReadonlyMap<string, number>,
): ActiveAgentEntry[] {
  const children = CHILD_SEEDS.slice(0, childCount).map((seed, i) => ({
    id: `child-${i}`,
    source: seed.source,
    title: seed.title,
    statusLabel: seed.statusLabel,
    activityKey: `c${i}|${eventTicks.get(`child-${i}`) ?? 0}`,
  }));
  const subagents = SUBAGENT_SEEDS.slice(0, subagentCount).map((seed, i) => ({
    id: `agent-${i}`,
    source: seed.source,
    title: seed.title,
    statusLabel: seed.statusLabel,
    activityKey: `a${i}|${eventTicks.get(`agent-${i}`) ?? 0}`,
  }));
  return [...children, ...subagents];
}

// ---------------------------------------------------------------------------
// Story assembly
// ---------------------------------------------------------------------------

type ActiveAgentsIndicatorStoryProps = {
  activeChildren: number;
  activeSubagents: number;
  liveStream: boolean;
  reducedMotion: boolean;
  mainThreadIdle: boolean;
};

function StoryFrame({ children }: { children: React.ReactNode }) {
  // Flow from the top; the canvas body scrolls (t3team-storybook-canvas.css).
  return <div className="flex w-full flex-col items-center gap-6 p-8 pb-16">{children}</div>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-[520px] rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-3 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

const WORKING_ROW = {
  kind: "working" as const,
  id: "working-indicator-row",
  createdAt: "2026-08-25T16:58:00.000Z",
  showThinking: false,
};

/**
 * The REAL conversation working row. The active-agents indicator and the
 * flip step label are the production components, driven by
 * TimelineRowActivityCtx exactly as ChatView does it.
 */
function RealWorkingRow({
  activeAgents,
  workingStepLabel,
  onOpenAgents,
  mainThreadIdle = false,
}: {
  activeAgents: readonly ActiveAgentEntry[];
  workingStepLabel: string | null;
  onOpenAgents: () => void;
  mainThreadIdle?: boolean;
}) {
  return (
    <TimelineRowActivityCtx.Provider
      value={{
        isWorking: !mainThreadIdle,
        isRevertingCheckpoint: false,
        latestTurnId: "turn-design-pass" as TurnId,
        workingStepLabel,
        activeAgents,
        onOpenAgents,
      }}
    >
      <WorkingTimelineRow row={WORKING_ROW} />
    </TimelineRowActivityCtx.Provider>
  );
}

/** Demo stand-in for the Agents panel (real app: addAgentsSurface). */
function DemoAgentsPanel({
  entries,
  expanded,
}: {
  entries: readonly ActiveAgentEntry[];
  expanded: boolean;
}) {
  if (!expanded || entries.length === 0) return null;
  return (
    <div className="mb-1 ml-1 flex flex-col gap-1 border-l-2 border-sky-500/30 pl-3">
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500 animate-pulse" />
          <span className="text-foreground/80">{entry.title}</span>
          <span className="rounded-sm bg-accent/60 px-1 py-px text-[9px] text-muted-foreground/70">
            {entry.source === "child" ? "sub-run" : "subagent"}
          </span>
          <span className="text-muted-foreground/55">· {entry.statusLabel}</span>
        </div>
      ))}
      <div className="text-[10px] text-muted-foreground/60">active agents</div>
    </div>
  );
}

function ActiveAgentsIndicatorStory({
  activeChildren,
  activeSubagents,
  liveStream,
  reducedMotion,
  mainThreadIdle,
}: ActiveAgentsIndicatorStoryProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [ticks, setTicks] = useState<ReadonlyMap<string, number>>(() => new Map());

  const entries = buildEntries(activeChildren, activeSubagents, ticks);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const fire = (id: string) =>
    setTicks((current) => new Map(current).set(id, (current.get(id) ?? 0) + 1));

  // Auto stream: a random active agent produces live output every ~1.5–3.5s.
  useEffect(() => {
    if (!liveStream) return;
    let timer: number | undefined;
    const tick = () => {
      timer = window.setTimeout(
        () => {
          const current = entriesRef.current;
          const entry =
            current.length > 0 ? current[Math.floor(Math.random() * current.length)] : undefined;
          if (entry) fire(entry.id);
          tick();
        },
        1500 + Math.random() * 2000,
      );
    };
    tick();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [liveStream]);

  // The #40 plan-step label cycles; occasionally a second value lands within
  // ~450ms, which the 900ms debounce in the flip label swallows.
  const [label, setLabel] = useState(LABELS[0] ?? "Working");
  useEffect(() => {
    if (!liveStream) return;
    let timer: number | undefined;
    let pending: number | undefined;
    const tick = () => {
      timer = window.setTimeout(
        () => {
          setLabel((current) => {
            const i = Math.max(0, LABELS.indexOf(current));
            const step = 1 + Math.floor(Math.random() * (LABELS.length - 1));
            return LABELS[(i + step) % LABELS.length] ?? "Working";
          });
          if (Math.random() < 0.4) {
            pending = window.setTimeout(() => {
              setLabel((current) => {
                const i = Math.max(0, LABELS.indexOf(current));
                return LABELS[(i + 1) % LABELS.length] ?? "Working";
              });
            }, 450);
          }
          tick();
        },
        2800 + Math.random() * 1400,
      );
    };
    tick();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      if (pending !== undefined) clearTimeout(pending);
    };
  }, [liveStream]);

  return (
    <StoryFrame>
      {reducedMotion ? (
        <style>
          {
            ".t3team-aci-pulse, .t3team-aci-flip-out, .t3team-aci-flip-in { animation: none !important; }"
          }
        </style>
      ) : null}
      <Card
        title={`Real conversation working row · ${activeChildren} sub-run${activeChildren === 1 ? "" : "s"} + ${activeSubagents} subagent${activeSubagents === 1 ? "" : "s"}${liveStream ? " · live event stream" : " · idle (fully still)"}`}
      >
        <div className="rounded-lg border border-border/50 bg-card p-3">
          {/* conversation context: a user message above the working row */}
          <div className="mb-3 rounded-md bg-accent/60 px-3 py-2 text-sm">
            Refactor the settings panel to use the new schema
          </div>
          <RealWorkingRow
            activeAgents={entries}
            workingStepLabel={mainThreadIdle ? null : label}
            onOpenAgents={() => setPanelOpen((current) => !current)}
            mainThreadIdle={mainThreadIdle}
          />
          <DemoAgentsPanel entries={entries} expanded={panelOpen} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Simulate live output from:</span>
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => fire(entry.id)}
              className="rounded-sm border border-border/70 bg-accent/40 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            >
              {entry.title.length > 24 ? `${entry.title.slice(0, 24)}…` : entry.title}
            </button>
          ))}
        </div>

        <div className="text-[10px] text-muted-foreground">
          This is the unmodified <code className="text-foreground/70">WorkingTimelineRow</code> from
          components/chat/MessagesTimeline.tsx — the &ldquo;Working for …&rdquo; timer is its own.
          The dots (<code className="text-foreground/70">T3TeamActiveAgentsIndicator</code>) and the
          flip label (<code className="text-foreground/70">T3TeamActiveAgentsStepLabel</code>) are
          the real production components from t3team-activeAgentsIndicator.tsx, fed through
          <code className="text-foreground/70"> TimelineRowActivityCtx.activeAgents</code> exactly
          as ChatView does: merged running child threads (sub-runs) + live in-thread subagents,
          placed directly after &ldquo;Working for …&rdquo; and before the step label. Dots are
          completely still until an agent's activityKey changes (real trigger: childStatusUpdatedAt
          / lastMessageAt store updates, or subagent updatedAt / progress), then perform ONE slow
          pendulum move. Hover a dot → it scales up and the EXISTING label flips to that agent's
          live status (debounced 900ms, sequential FLIP — old text fully out, then new text in;
          nothing appended). Click the group → Agents panel. The &ldquo;+n&rdquo; on the
          count-scaling rows is the overflow counter: 5 dots max.
        </div>
      </Card>

      {mainThreadIdle ? (
        <Card title="Main thread idle — agents still active">
          <div className="rounded-lg border border-border/50 bg-card p-3">
            <RealWorkingRow
              activeAgents={entries}
              workingStepLabel={null}
              onOpenAgents={() => setPanelOpen((current) => !current)}
              mainThreadIdle
            />
          </div>
          <div className="text-[10px] text-muted-foreground">
            No &ldquo;Working for …&rdquo; when the main turn is idle: the same row surface leads
            with the active-agent count, and the label defaults to the most recent agent&rsquo;s
            live status (hover flips it, as usual). In the app, this row is appended by
            deriveMessagesTimelineRows via
            <code className="text-foreground/70"> idleActiveAgentsPresent</code> (thread-error /
            resume offers keep priority).
          </div>
        </Card>
      ) : null}

      <Card title="Count scaling (real rows, idle)">
        <div className="flex flex-col gap-2">
          {[
            { children: 1, agents: 0 },
            { children: 2, agents: 1 },
            { children: 4, agents: 1 },
            { children: 5, agents: 2 },
          ].map(({ children, agents }, i) => (
            <RealWorkingRow
              key={i}
              activeAgents={buildEntries(children, agents, new Map())}
              workingStepLabel={null}
              onOpenAgents={() => {}}
            />
          ))}
        </div>
      </Card>

      <Card title="Reduced motion">
        <RealWorkingRow
          activeAgents={buildEntries(3, 1, new Map())}
          workingStepLabel="Refactoring the settings panel"
          onOpenAgents={() => {}}
        />
        <div className="text-[10px] text-muted-foreground">
          With <code className="text-foreground/70">prefers-reduced-motion</code> the pendulum and
          FLIP moves stop; an event still shows as a brightness-only change.
        </div>
      </Card>
    </StoryFrame>
  );
}

const meta = {
  title: "T3Team/Conversation/Active Agents Indicator (GHE #201)",
  component: ActiveAgentsIndicatorStory,
  args: {
    activeChildren: 3,
    activeSubagents: 1,
    liveStream: true,
    reducedMotion: false,
    mainThreadIdle: false,
  },
  argTypes: {
    activeChildren: {
      control: { type: "number", min: 0, max: 8 },
      description: "Running child threads (sub-runs).",
    },
    activeSubagents: {
      control: { type: "number", min: 0, max: 3 },
      description: "Live in-thread subagents.",
    },
    liveStream: {
      control: "boolean",
      description: "Auto-simulate live-output events from random active agents + label updates.",
    },
    reducedMotion: {
      control: "boolean",
      description: "Force the reduced-motion fallback (brightness only, no moves).",
    },
    mainThreadIdle: {
      control: "boolean",
      description:
        "Main turn idle: no Working… row; the indicator renders anyway with the count prefix.",
    },
  },
} satisfies Meta<typeof ActiveAgentsIndicatorStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MergedSources: Story = {
  args: { activeChildren: 3, activeSubagents: 1, liveStream: true },
};
export const MainThreadIdle: Story = {
  args: { activeChildren: 3, activeSubagents: 1, liveStream: true, mainThreadIdle: true },
};
export const ManyAgentsCollapsed: Story = {
  args: { activeChildren: 5, activeSubagents: 2, liveStream: true },
};
export const IdleFullyStill: Story = {
  args: { activeChildren: 3, activeSubagents: 1, liveStream: false },
};
export const ReducedMotionStatic: Story = {
  args: { activeChildren: 4, activeSubagents: 1, liveStream: true, reducedMotion: true },
};
