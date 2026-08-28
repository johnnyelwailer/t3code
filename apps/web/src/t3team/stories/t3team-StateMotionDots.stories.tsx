import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useRef, useState } from "react";

import type { TurnId } from "@t3tools/contracts";
import { TimelineRowActivityCtx, WorkingTimelineRow } from "~/components/chat/MessagesTimeline";
import type { ActiveAgentEntry } from "~/t3team/chat/t3team-activeAgentsCore";
import {
  buildEntries,
  rollDrift,
  stateWordOf,
  type DotState,
  type Drift,
} from "./t3team-mockAgentSeeds";

import "./t3team-StateMotionDots.css";
// (createSBendPhysics / SplitFlipText now live in ~/t3team/chat/ — this
// story imports nothing of the dot language directly anymore.)

/**
 * GHE #201 follow-up — the state-textured status dots, on the REAL working row.
 *
 * THIS STORY IS THE VISUAL BASELINE FOR A SHIPPED FEATURE — the dot
 * language lives in the APP, not here:
 *
 *   state texture (per-agent thinking/writing/working/waiting/settled dots,
 *   hue wander, status-change swing, waiting ring, 1.5x rest scale)
 *     → t3team-index.css (keyed off data-t3team-state, stamped by the
 *       real T3TeamActiveAgentsIndicator from ActiveAgentEntry.dotState)
 *   S-bend + snap proximity (real mouse: the row bends away from the
 *   cursor on the Y axis, single-grower lock on a dot's home)
 *     → t3team-activeAgentsPhysics.ts, run by the indicator
 *   split lead text ("state word for timer", each piece flips on its own,
 *   width glides so the dots move WITH the text)
 *     → t3team-workingLeadText.tsx + t3team-splitFlipText.tsx, rendered
 *       inside the real WorkingTimelineRow
 *   per-dot click opens that agent (child thread on the side / subagent →
 *   Agents panel)
 *     → onOpenAgent seam: T3TeamActiveAgentsIndicator →
 *       TimelineRowActivityCtx → MessagesTimeline (default derivation
 *       uses the host's onOpenThread)
 *
 * What this story adds on top: simulated per-agent states that re-roll
 * every ~4.5s (production derives dotState from live labels), a side
 * panel stand-in for "open that thread on the side", the click-to-capture
 * debug rig, and opt-out toggles (no ring / no hue / no springs) for
 * baseline comparison.
 */

const WORKING_ROW = {
  kind: "working" as const,
  id: "working-indicator-row",
  createdAt: new Date().toISOString(), // timer counts up from 0s at story load
};

/** The REAL conversation working row, driven by TimelineRowActivityCtx. */
function RealWorkingRow({
  activeAgents,
  workingStepLabel,
  onOpenAgents,
  onOpenAgent,
  threadState,
}: {
  activeAgents: readonly ActiveAgentEntry[];
  workingStepLabel: string | null;
  onOpenAgents: () => void;
  onOpenAgent?: (entry: ActiveAgentEntry) => void;
  threadState: DotState | null;
}) {
  return (
    <TimelineRowActivityCtx.Provider
      value={{
        isWorking: true,
        isRevertingCheckpoint: false,
        latestTurnId: "turn-design-pass" as TurnId,
        workingStepLabel,
        activeAgents,
        onOpenAgents,
        onOpenAgent,
        threadActivityState: threadState === "settled" ? null : threadState,
      }}
    >
      <WorkingTimelineRow row={WORKING_ROW} />
    </TimelineRowActivityCtx.Provider>
  );
}

function Card({ title, children, footnote }: { title: string; children: React.ReactNode; footnote?: string }) {
  return (
    <div className="w-[560px] rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-3 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="flex flex-col gap-3">{children}</div>
      {footnote ? <div className="text-[10px] text-muted-foreground/70">{footnote}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side panel — the clicked agent's thread card (the app opens the real
// thread / Agents panel; this stand-in keeps the exploration self-contained)
// ---------------------------------------------------------------------------

function AgentSidePanel({
  entry,
  state,
  onClose,
}: {
  entry: ActiveAgentEntry;
  state: DotState;
  onClose: () => void;
}) {
  return (
    <div data-sdv-panel className="w-[300px] shrink-0 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${
            entry.source === "subagent" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-sky-500/15 text-sky-600 dark:text-sky-400"
          }`}
        >
          {entry.source === "subagent" ? "provider subagent" : "child thread"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground"
          aria-label="close"
        >
          ✕
        </button>
      </div>
      <div className="text-sm font-medium">{entry.title}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {entry.statusLabel} · {stateWordOf(state)}
      </div>
      <div className="mt-3 rounded-md bg-accent/50 px-3 py-2 text-[11px] text-foreground/80">
        Thread pane stand-in — in the app this dot opens the {entry.source} here on the side.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

type StateMotionDotsProps = {
  /** Pins the thread-level state. "auto" lets it drift with the agents. */
  threadState: "auto" | DotState;
  /** Re-roll the per-agent states randomly every ~4.5s. */
  drift: boolean;
  activeChildren: number;
  activeSubagents: number;
  /** Auto-simulate live-output events (real one-shot dot pulse) + label cycling. */
  liveStream: boolean;
  /** Opt out of the waiting-agent breathing ring. */
  ring: boolean;
  /** Opt out of the S-bend + snap pointer physics (real mouse). */
  springs: boolean;
  /** Opt out of the subtle per-dot hue wander. */
  colorShifts: boolean;
  /** Force the reduced-motion fallback (static dim dots). */
  reducedMotion: boolean;
  /** Debug: pointer crosshair + true homes + click-to-capture snapshots. */
  debug: boolean;
  /** Freeze the lead timer: no flip, no width transition — fully static row. */
  frozenClock: boolean;
};

function StateMotionDots({
  threadState,
  drift,
  activeChildren,
  activeSubagents,
  liveStream,
  ring,
  springs,
  colorShifts,
  reducedMotion,
  debug,
  frozenClock,
}: StateMotionDotsProps) {
  const [ticks, setTicks] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [driftState, setDriftState] = useState<Drift>(() => rollDrift(activeChildren + activeSubagents));
  const entries = buildEntries(activeChildren, activeSubagents, ticks);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const mixedScopeRef = useRef<HTMLDivElement | null>(null);
  // Viewport-space pointer for the debug overlay (the production physics in
  // the indicator tracks its own pointer).
  const pointerRef = useRef({ x: 0, y: 0, active: false });

  const [liveReadout, setLiveReadout] = useState("");
  const [snaps, setSnaps] = useState<readonly string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);


  const fire = (id: string) =>
    setTicks((current) => new Map(current).set(id, (current.get(id) ?? 0) + 1));

  // The per-agent states re-roll randomly every ~4.5s. The story stamps
  // them directly onto the REAL cells (data-t3team-state — the same
  // attribute the production indicator stamps from entry.dotState), so
  // the production CSS textures each dot.
  useEffect(() => {
    const scope = mixedScopeRef.current;
    if (!scope) return;
    const cells = scope.querySelectorAll<HTMLElement>(".t3team-aci-cell");
    entries.slice(0, 5).forEach((entry, i) => {
      const cell = cells[i];
      if (!cell) return;
      const state = driftState.agents[i] ?? "working";
      const prev = cell.getAttribute("data-t3team-state");
      cell.setAttribute("data-t3team-state", state);
      cell.style.setProperty("--t3team-aci-i", String(i));
      if (prev && prev !== state) {
        // one-shot re-roll swing (story-only flourish; production fires
        // the same keyframe when entry.dotState changes)
        cell.classList.add("sdv-shift");
        const clear = (event: AnimationEvent) => {
          if (event.animationName === "t3team-sdv-shift") cell.classList.remove("sdv-shift");
        };
        cell.addEventListener("animationend", clear);
        window.setTimeout(() => {
          cell.removeEventListener("animationend", clear);
          cell.classList.remove("sdv-shift");
        }, 1400);
      }
    });
  }, [driftState, entries, activeChildren, activeSubagents]);

  // Live-output event stream + step label (same simulation as the GHE #201
  // design-pass story).
  useEffect(() => {
    if (!liveStream) return;
    let timer: number | undefined;
    const tick = () => {
      timer = window.setTimeout(
        () => {
          const current = entriesRef.current;
          const entry = current.length > 0 ? current[Math.floor(Math.random() * current.length)] : undefined;
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

  const [label, setLabel] = useState("Refactoring the settings panel");
  const LABELS = [
    "Refactoring the settings panel",
    "Extracting the settings schema",
    "Running the migration checks",
    "Cleaning up unused exports",
  ];
  useEffect(() => {
    if (!liveStream) return;
    const timer = window.setInterval(
      () => setLabel((current) => LABELS[(LABELS.indexOf(current) + 1) % LABELS.length] ?? "Working"),
      3200,
    );
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStream]);

  // Per-dot clicks now go through the PRODUCTION onOpenAgent seam (the
  // real indicator calls it for the clicked entry).
  const onOpenAgent = (entry: ActiveAgentEntry) => {
    const index = entries.findIndex((current) => current.id === entry.id);
    setSelectedAgent(index >= 0 ? index : null);
  };

  // -------------------------------------------------------------------------
  // Debug overlay: crosshair on the raw pointer + one dashed ring per dot's
  // live home, so trigger vs pointer vs home can be compared pixel-by-pixel.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const scope = mixedScopeRef.current;
    if (!scope || !debug) return;
    let raf = 0;
    let dbg: HTMLDivElement | null = null;
    let lastReadout = 0;
    let dots: HTMLElement[] = [];
    const tick = (now: number) => {
      if (dots.length === 0) {
        dots = Array.from(scope.querySelectorAll<HTMLElement>(".t3team-aci-cell")).filter((d) => d.offsetWidth > 0);
      }
      const srect = scope.getBoundingClientRect();
      const p = pointerRef.current;
      const cursor = { x: p.x - srect.left, y: p.y - srect.top };
      if (!dbg) {
        dbg = document.createElement("div");
        dbg.className = "sdv-debug";
        dbg.innerHTML =
          Array.from({ length: dots.length }, () => `<span class="sdv-debug-home"></span>`).join("") +
          `<div class="sdv-debug-cross"></div>`;
        scope.appendChild(dbg);
      }
      dbg.querySelector<HTMLElement>(".sdv-debug-cross")!.style.left = `${cursor.x}px`;
      dbg.querySelector<HTMLElement>(".sdv-debug-cross")!.style.top = `${cursor.y}px`;
      dots.forEach((dot, k) => {
        const dr = dot.getBoundingClientRect();
        // subtract the displacement the physics loop applies, to read the home
        const t = dot.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        const hx = dr.left + dr.width / 2 - srect.left - (t ? parseFloat(t[1] ?? "0") : 0);
        const hy = dr.top + dr.height / 2 - srect.top - (t ? parseFloat(t[2] ?? "0") : 0);
        const ring = dbg!.querySelectorAll<HTMLElement>(".sdv-debug-home")[k];
        if (ring) {
          ring.style.left = `${hx}px`;
          ring.style.top = `${hy}px`;
        }
      });
      if (now - lastReadout > 150) {
        lastReadout = now;
        setLiveReadout(`click row = capture · cursor(${cursor.x.toFixed(1)}, ${cursor.y.toFixed(1)})`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      dbg?.remove();
      dots = [];
    };
  }, [debug]);

  // Click-to-capture: every pointerdown freezes the full coordinate
  // snapshot — as chips below the card AND to the local capture server
  // (http://127.0.0.1:6011 → /tmp/sdv-snaps.jsonl) for the developer.
  useEffect(() => {
    if (!debug) return;
    const scope = mixedScopeRef.current;
    if (!scope) return;
    let snapCount = 0;
    const onDown = () => {
      const srect = scope.getBoundingClientRect();
      const p = pointerRef.current;
      const cursor = p.active ? { x: p.x - srect.left, y: p.y - srect.top } : null;
      const dots = Array.from(scope.querySelectorAll<HTMLElement>(".t3team-aci-cell")).map((d) => {
        const r = d.getBoundingClientRect();
        return {
          cx: Math.round((r.left + r.width / 2 - srect.left) * 10) / 10,
          cy: Math.round((r.top + r.height / 2 - srect.top) * 10) / 10,
          w: Math.round(r.width * 10) / 10,
          scale: d.style.scale || "1",
          transform: d.style.transform || "",
        };
      });
      snapCount += 1;
      const snap = {
        n: snapCount,
        t: new Date().toISOString(),
        zoom: window.devicePixelRatio,
        cursor,
        srect: { left: srect.left, top: srect.top, w: srect.width, h: srect.height },
        dots,
      };
      fetch("http://127.0.0.1:6011/snap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snap),
      }).catch(() => undefined);
      const cursorText = cursor ? `cursor(${cursor.x.toFixed(1)}, ${cursor.y.toFixed(1)})` : "cursor(n/a)";
      const dotsText = dots.map((d, i) => `d${i}@(${d.cx},${d.cy})\u00d7${d.scale}`).join("  ");
      setSnaps((prev) => [`SNAP ${snapCount}  ${cursorText}  ${dotsText}`, ...prev].slice(0, 6));
    };
    scope.addEventListener("pointerdown", onDown);
    return () => scope.removeEventListener("pointerdown", onDown);
  }, [debug]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const pinnedThread = threadState === "auto" ? null : threadState;
  const threadForMixed: DotState | null = pinnedThread ?? driftState.thread;

  const selectedEntry = selectedAgent !== null ? entries[selectedAgent] : undefined;

  return (
    <div data-sdv-selected={selectedAgent ?? -1} className="flex w-full flex-col items-center gap-8 px-12 py-10 pb-16">
      {reducedMotion ? (
        <style>{`.sdv-mixed .h-1.w-1, .sdv-mixed .t3team-aci-dot, .sdv-mixed .t3team-aci-cell, .sdv-mixed .t3team-aci-cell > span, .sdv-mixed .t3team-aci-cell > span::before, .t3team-aci-pulse, .t3team-aci-flip-in, .t3team-aci-flip-out { animation: none !important; } .sdv-mixed .t3team-aci-dot { opacity: 0.4 !important; box-shadow: none !important; } .t3team-aci-lead { transition: none !important; }`}</style>
      ) : null}

      <div className="flex w-full items-start justify-center gap-6">
        <div className="flex flex-col gap-8">
          <Card
            title="The production working row (this is what ships)"
            footnote="Real WorkingTimelineRow + real indicator: state-textured dots, split lead text, S-bend + snap proximity, per-dot thread opening. No scope overrides — nothing here is mocked."
          >
            <div className="rounded-lg border border-border/50 bg-card p-4">
              <div className="mb-3 rounded-md bg-accent/60 px-3 py-2 text-sm">
                Refactor the settings panel to use the new schema
              </div>
              <RealWorkingRow
                activeAgents={entries}
                workingStepLabel={label}
                onOpenAgents={() => {}}
                threadState={pinnedThread}
              />
            </div>
          </Card>

          <Card
            title="State-motion dots — every dot carries ITS OWN state, re-rolling randomly every ~4.5s"
            footnote="Production CSS textures each dot (thinking = cool wave · working = warm snappy pulses · waiting = breath + ring · settled = dim). Click a dot: its thread opens on the side. Hover: S-bend avoidance + grow-on-lock."
          >
            <div className="rounded-lg border border-border/50 bg-card p-4">
              <div className="mb-3 rounded-md bg-accent/60 px-3 py-2 text-sm">
                Refactor the settings panel to use the new schema
              </div>
              <div
                ref={mixedScopeRef}
                data-sdv-no-springs={springs && !reducedMotion ? undefined : ""}
                className={`relative ${ring ? "" : "sdv-no-ring"} ${colorShifts ? "" : "sdv-no-hue"} ${frozenClock ? "sdv-frozen" : ""} sdv-mixed sdv-st-${threadForMixed ?? "settled"}`}
                onPointerMove={
                  debug
                    ? (event) => {
                        pointerRef.current = { ...pointerRef.current, x: event.clientX, y: event.clientY, active: true };
                      }
                    : undefined
                }
                onPointerLeave={debug ? () => (pointerRef.current.active = false) : undefined}
              >
                <RealWorkingRow
                  activeAgents={entries}
                  workingStepLabel={label}
                  onOpenAgents={() => {}}
                  onOpenAgent={onOpenAgent}
                  threadState={threadForMixed}
                />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDriftState((current) => rollDrift(entriesRef.current.length))}
                  className="rounded-sm border border-border/70 bg-accent/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  re-roll agent states
                </button>
                <span className="text-[10px] text-muted-foreground/70">
                  thread: {threadForMixed === null ? "Working" : stateWordOf(threadForMixed)} · agents:{" "}
                  {entries.slice(0, 5).map((_, i) => driftState.agents[i] ?? "working").join(" · ")}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {selectedEntry ? (
          <AgentSidePanel
            entry={selectedEntry}
            state={driftState.agents[selectedAgent ?? 0] ?? "working"}
            onClose={() => setSelectedAgent(null)}
          />
        ) : null}
      </div>

      {debug ? (
        <div className="flex w-full flex-col items-start gap-2">
          {snaps.map((text, i) => (
            <div key={`${i}-${text.slice(0, 12)}`} className="sdv-snap-chip">
              {text}
            </div>
          ))}
          <div className="sdv-live">{liveReadout || "move the mouse over the row…"}</div>
        </div>
      ) : null}

      <div className="text-[10px] text-muted-foreground/70">
        With <code className="text-foreground/70">prefers-reduced-motion</code> every state is a
        static dim dot (the ring and the springs stop too).
      </div>
    </div>
  );
}

const meta = {
  title: "T3Team/Conversation/Status Dots — State Motion (GHE #201)",
  component: StateMotionDots,
  args: {
    threadState: "auto" as "auto" | DotState,
    drift: true,
    activeChildren: 3,
    activeSubagents: 1,
    liveStream: true,
    ring: true,
    springs: true,
    colorShifts: true,
    reducedMotion: false,
  },
  argTypes: {
    threadState: {
      control: "select",
      options: ["auto", "thinking", "writing", "working", "waiting", "settled"],
      description: "Pins the THREAD-level state (state word). 'auto' lets it drift with the agents.",
    },
    drift: {
      control: "boolean",
      description: "Re-roll the per-agent states randomly every ~4.5s.",
    },
    activeChildren: {
      control: { type: "number", min: 1, max: 5 },
      description: "Child-thread agent dots shown (both kinds feed the same real indicator).",
    },
    activeSubagents: {
      control: { type: "number", min: 0, max: 2 },
      description: "Provider-native subagent dots shown (both kinds feed the same real indicator).",
    },
    liveStream: {
      control: "boolean",
      description: "Auto-simulate live-output events (real one-shot dot pulse) + label cycling.",
    },
    ring: {
      control: "boolean",
      description: "Opt out of the waiting-agent breathing ring.",
    },
    debug: {
      control: "boolean",
      name: "Debug alignment",
      description:
        "Draws the raw pointer crosshair and a dashed ring at every dot's true home, so you can verify trigger vs pointer vs home pixel-by-pixel. Clicks also capture snapshots.",
    },
    springs: {
      control: "boolean",
      description:
        "S-bend + snap (real mouse, production physics): the row avoids the cursor on the vertical axis; dots keep their x-pitch, near-cursor dots shrink, the dot under the cursor locks at home and grows.",
    },
    colorShifts: {
      control: "boolean",
      description: "Opt out of the subtle per-dot hue wander.",
    },
    reducedMotion: {
      control: "boolean",
      description: "Force the reduced-motion fallback (static dim dots).",
    },
  },
} satisfies Meta<typeof StateMotionDots>;

export default meta;
type Story = StoryObj<typeof StateMotionDots>;

export const StateMotion: Story = {
  name: "State-motion dots (mixed, drifting)",
  args: { threadState: "auto", drift: true, ring: true, springs: true, colorShifts: true, debug: false },
};

export const ThreadWaiting: Story = {
  name: "Thread waiting — rings on the waiting agents",
  args: { threadState: "waiting", drift: false, ring: true, springs: false },
};

export const NoIntegrations: Story = {
  name: "State motion only (no ring, no springs, no hue wander)",
  args: { threadState: "auto", drift: true, ring: false, springs: false, colorShifts: false },
};

export const Proximity: Story = {
  name: "Proximity — real mouse (S-bend + snap)",
  args: { threadState: "auto", drift: false, ring: true, springs: true },
};

export const DebugAlignment: Story = {
  name: "Debug alignment (overlay ON)",
  args: { threadState: "auto", drift: false, ring: true, springs: true, debug: true },
};

export const AlignmentTest: Story = {
  name: "Alignment test (fully static row)",
  args: {
    threadState: "working",
    drift: false,
    activeChildren: 3,
    activeSubagents: 1,
    liveStream: false,
    ring: false,
    springs: true,
    colorShifts: false,
    reducedMotion: false,
    debug: true,
    frozenClock: true,
  },
};

export const ReducedMotionStatic: Story = {
  name: "Reduced motion (static fallback)",
  args: { threadState: "working", drift: false, ring: true, springs: true, reducedMotion: true },
};
