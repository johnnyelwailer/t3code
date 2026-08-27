import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { TurnId } from "@t3tools/contracts";
import { TimelineRowActivityCtx, WorkingTimelineRow } from "~/components/chat/MessagesTimeline";
import type { ActiveAgentEntry } from "~/t3team/chat/t3team-activeAgentsCore";

import { createSBendPhysics, defaultSBendConfig, type SBendOut } from "./t3team-stateMotionPhysics";
import { SplitFlipText } from "./t3team-splitFlipText";
import {
  buildEntries,
  rollDrift,
  stateWordOf,
  type DotState,
  type Drift,
} from "./t3team-mockAgentSeeds";

import "./t3team-StateMotionDots.css";

/**
 * GHE #201 follow-up — the chosen status-row dot direction, built on the
 * REAL conversation working row.
 *
 * WHAT THIS STORY IS
 * ------------------
 * Mounts the REAL `WorkingTimelineRow` (components/chat/MessagesTimeline)
 * fed with REAL-shaped data through the app's own seam
 * (`TimelineRowActivityCtx`): the active-agents indicator dots, the #208
 * state word, the flip step label and the production CSS
 * (`t3team-aci-*`, t3team-index.css) are untouched. Both REAL agent kinds
 * are present: child threads (`activeChildren`) and provider-native
 * subagents (`activeSubagents`) — the indicator shows both.
 *
 * THE DOT LANGUAGE (all restyle lives in the CSS file, keyed off the
 * `data-sdv-state` attribute this story stamps on the real cells):
 *   thinking → slow smooth wave, cool hue · writing → slower, cooler
 *   working  → snappy pulses, warm hue    · waiting → one soft breath + ring
 *   settled  → dim, still
 * Each AGENT dot carries ITS OWN state; the per-agent states re-roll
 * randomly every ~4.5s so a busy thread keeps moving.
 *
 * REUSABLE PARTS (extracted so they can be used outside this story):
 *   t3team-stateMotionPhysics.ts — the S-bend + snap pointer physics,
 *      pure and DOM-free (createSBendPhysics)
 *   t3team-splitFlipText.tsx     — the production 3D status roll as a
 *      component (SplitFlipText), with quiet-swap gating
 *   t3team-mockAgentSeeds.ts     — seeds, weighted state rolls, entries
 *
 * INTERACTION (the "proximity springs" control):
 *   S-BEND — the row avoids the cursor on the Y axis: it parts around the
 *      cursor's x, one side easing down, the other up (an S along the
 *      horizontal axis). Dots only ever move vertically, so their x-pitch
 *      is sacred and they never approach each other.
 *   SNAP   — the cursor on a dot's home locks THAT one dot exactly at its
 *      home and grows it; near-cursor dots shrink in anticipation. The
 *      hand-off between dots is immediate; between dots the incumbent
 *      holds (no chatter). Details: t3team-stateMotionPhysics.ts.
 *   CLICK  — each dot is individually clickable (cursor pointer) and opens
 *      that agent's thread card on the side (story-side stand-in for the
 *      app's child-thread/subagent pane).
 *
 * DEBUG: the "Debug alignment" control draws the raw pointer crosshair +
 * every true home, and every click captures the full coordinate snapshot
 * to the local server on :6011 (files: /tmp/sdv-snaps.jsonl).
 */

// ---------------------------------------------------------------------------
// Row chrome
// ---------------------------------------------------------------------------

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
  threadState,
}: {
  activeAgents: readonly ActiveAgentEntry[];
  workingStepLabel: string | null;
  onOpenAgents: () => void;
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
        threadActivityState: threadState,
      }}
    >
      <WorkingTimelineRow row={WORKING_ROW} />
    </TimelineRowActivityCtx.Provider>
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

// ---------------------------------------------------------------------------
// Split lead text ("<state word> for <timer>"), each piece on its OWN flip
// ---------------------------------------------------------------------------

/** Same format as the production row's WorkingTimer. */
function formatElapsed(startIso: string, nowMs: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - Date.parse(startIso)) / 1000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`;
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * The story's split replacement for the production "Working for 0:05" run.
 * Portaled into the row's own first flex slot (the production single piece
 * is hidden by CSS).
 *
 * CHOREOGRAPHY — the slot width glides on the shared spring, but only
 * starting when the incoming text actually mounts (the "in" half of the
 * roll). Reserving space earlier made the dots move while the text was
 * still the old one — the "layout glides, text jumps" mismatch. Quiet
 * swaps (plain seconds ticks, no roll) glide immediately.
 *
 * inline-block on purpose: a flex container drops the whitespace between
 * the pieces ("WaitingFor").
 */
function LeadText({ word, time }: { word: string; time: string }) {
  const leadRef = useRef<HTMLSpanElement | null>(null);
  const sizerRef = useRef<HTMLSpanElement | null>(null);
  const rollingRef = useRef(false);

  // The timer only rolls when the digits on screen actually change shape:
  // the minute/hour part changes, or the digit count changes. A seconds
  // tick inside the same format ("1m 5s" → "1m 6s") updates in place.
  const timerShouldFlip = (prev: string, next: string) => {
    const stripSeconds = (value: string) => value.replace(/\s?\d+s$/, "");
    return stripSeconds(prev) !== stripSeconds(next) || prev.length !== next.length;
  };

  const applyWidth = () => {
    const lead = leadRef.current;
    const sizer = sizerRef.current;
    if (!lead || !sizer) return;
    sizer.textContent = `${word} for ${time}`;
    const target = sizer.getBoundingClientRect().width;
    if (target > 0) lead.style.width = `${target}px`;
  };

  const prevTextRef = useRef({ word, time });

  // Apply the slot width toward the incoming text — but decide, BEFORE
  // the roll starts, whether a piece is about to roll. Reserving space
  // before the new text mounts made the dots move while the old text was
  // still on screen ("layout glides, text jumps"). While a piece rolls
  // we HOLD the width; the glide starts the moment the new text mounts
  // (the "in" callback below). Quiet swaps (plain seconds ticks, no
  // roll) apply immediately, as does the initial mount.
  useEffect(() => {
    const prev = prevTextRef.current;
    prevTextRef.current = { word, time };
    const wordRolls = word !== prev.word;
    const timeRolls = time !== prev.time && timerShouldFlip(prev.time, time);
    if (wordRolls || timeRolls) {
      rollingRef.current = true; // hold; width applied on the "in" phase
      return;
    }
    applyWidth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, time]);

  const onPhase = (phase: "idle" | "out" | "in") => {
    rollingRef.current = phase === "out";
    if (phase === "in") applyWidth();
  };

  return (
    <span ref={leadRef} className="sdv-lead">
      <SplitFlipText text={word} onPhaseChange={onPhase} />
      <span> for </span>
      <SplitFlipText text={time} shouldFlip={timerShouldFlip} onPhaseChange={onPhase} />
      <span ref={sizerRef} className="sdv-lead-sizer" aria-hidden />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Side panel — the clicked agent's thread card
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
    <div className="w-[300px] shrink-0 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${
            entry.source === "subagent"
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "bg-sky-500/15 text-sky-600 dark:text-sky-400"
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
  /** A waiting agent dot gets one soft breathing ring (shared spring easing). */
  ring: boolean;
  /** S-bend + snap pointer physics (real mouse). */
  springs: boolean;
  /** Subtle per-dot hue wander; a bigger one-shot swing on status change. */
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
  const [driftState, setDriftState] = useState<Drift>(() =>
    rollDrift(activeChildren + activeSubagents),
  );
  const entries = buildEntries(activeChildren, activeSubagents, ticks);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const mixedScopeRef = useRef<HTMLDivElement | null>(null);
  // The pointer in VIEWPORT space (raw clientX/clientY). Converted to row
  // space EVERY FRAME against a fresh scope rect — the layout moves under
  // a still mouse (width transitions, re-rolls), and event-time
  // conversion desyncs the trigger from the actual pointer.
  const pointerRef = useRef({ x: 0, y: 0, active: false });

  const [liveReadout, setLiveReadout] = useState("");
  const [snaps, setSnaps] = useState<readonly string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);

  // The split lead text is portaled into the row's own first flex slot
  // (the production single-piece "Working for 0:05" is hidden by CSS).
  const [leadAnchor, setLeadAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setLeadAnchor(mixedScopeRef.current?.querySelector<HTMLElement>(".shrink-0") ?? null);
  }, []);

  // 1s clock for the lead timer; frozenClock pins it for static testing.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (frozenClock) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [frozenClock]);

  const fire = (id: string) =>
    setTicks((current) => new Map(current).set(id, (current.get(id) ?? 0) + 1));

  // The per-agent states re-roll randomly every ~4.5s.
  useEffect(() => {
    if (!drift || reducedMotion) return;
    const timer = window.setInterval(() => {
      setDriftState((current) => rollDrift(entriesRef.current.length, current));
    }, 4500);
    return () => window.clearInterval(timer);
  }, [drift, reducedMotion]);

  // Stamp the REAL agent cells with their own state + index so the CSS can
  // texture each dot (motion + color + ring) per state. A state re-roll
  // gives that cell one .sdv-shift cycle (visible hue swing + pop).
  useEffect(() => {
    const scope = mixedScopeRef.current;
    if (!scope) return;
    const cells = scope.querySelectorAll(".t3team-aci-cell");
    entries.slice(0, 5).forEach((entry, i) => {
      const cell = cells[i];
      if (!cell) return;
      const state = driftState.agents[i] ?? "working";
      const prev = cell.getAttribute("data-sdv-state");
      cell.setAttribute("data-sdv-state", state);
      cell.style.setProperty("--sdv-i", String(i));
      if (prev && prev !== state) {
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
      () =>
        setLabel((current) => LABELS[(LABELS.indexOf(current) + 1) % LABELS.length] ?? "Working"),
      3200,
    );
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStream]);

  // Per-dot clicks: the real cells all call the group's onOpenAgents, so
  // the story intercepts at scope level — the cell under the pointer
  // selects that agent for the side panel.
  useEffect(() => {
    const scope = mixedScopeRef.current;
    if (!scope) return;
    const onDown = (event: MouseEvent) => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>(".t3team-aci-cell");
      if (!cell || !scope.contains(cell)) return;
      const cells = Array.from(scope.querySelectorAll(".t3team-aci-cell")).filter(
        (d) => d.offsetWidth > 0,
      );
      const index = cells.indexOf(cell);
      setSelectedAgent(index >= 0 ? index : null);
    };
    scope.addEventListener("pointerdown", onDown);
    return () => scope.removeEventListener("pointerdown", onDown);
  }, []);

  // -------------------------------------------------------------------------
  // S-BEND + SNAP pointer physics — real mouse, written on the real cells.
  // The math lives in t3team-stateMotionPhysics.ts (pure, reusable); this
  // effect only bridges it to the DOM: read homes → step → write poses.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const scope = mixedScopeRef.current;
    if (!scope) return;

    const physics = createSBendPhysics(defaultSBendConfig);
    const out: SBendOut = { poses: [], scales: [], snapIndex: -1 };

    let raf = 0;
    let dots: HTMLElement[] = [];
    let dbg: HTMLDivElement | null = null;
    let lastReadout = 0;
    let last = 0;

    const ensureDebug = (count: number) => {
      if (dbg) return;
      dbg = document.createElement("div");
      dbg.className = "sdv-debug";
      dbg.innerHTML =
        Array.from({ length: count }, () => `<span class="sdv-debug-home"></span>`).join("") +
        `<div class="sdv-debug-cross"></div>`;
      scope.appendChild(dbg);
    };

    const tick = (now: number) => {
      // Perf: reuse the cached dot list; only re-query when the first node
      // left the tree (drift re-roll / count change). One contains() check
      // per frame beats a per-frame querySelectorAll + allocation.
      if (dots.length === 0 || !scope.contains(dots[0])) {
        dots = Array.from(scope.querySelectorAll<HTMLElement>(".h-1.w-1, .t3team-aci-cell")).filter(
          (d) => d.offsetWidth > 0,
        );
      }
      if (dots.length === 0) {
        raf = requestAnimationFrame(tick);
        return;
      }

      // Perf: all reads first (batched layout), writes after — one reflow
      // per frame, not one per dot.

      // Tooltip hygiene: the production cells AND their group span carry
      // native `title`/`aria-label`; with moving dots the tooltip would
      // linger over nothing, and the flicker between two pointer regions
      // (group span vs cell) is what made the cursor icon twitch. The
      // cells get `cursor: pointer` via CSS; the group span is plain.
      dots.forEach((d) => {
        if (d.hasAttribute("title")) d.removeAttribute("title");
        if (d.hasAttribute("aria-label")) d.removeAttribute("aria-label");
      });
      const groupSpan = scope
        .querySelector<HTMLElement>(".t3team-aci-cell")
        ?.closest("span[title]");
      if (groupSpan?.hasAttribute("title")) groupSpan.removeAttribute("title");

      // Reads (batched): scope rect + each home. Homes are NOT cached —
      // layout shifts (lead-text width transition, re-rolls) would poison
      // a first-sight capture; each frame re-derives the untransformed
      // center by subtracting our own displacement from the live rect.
      const srect = scope.getBoundingClientRect();
      const p = pointerRef.current;
      const cursor = { x: p.x - srect.left, y: p.y - srect.top, active: p.active };
      const homes = dots.map((dot, i) => {
        const dr = dot.getBoundingClientRect();
        const prevX = out.poses[i]?.x ?? 0;
        const prevY = out.poses[i]?.y ?? 0;
        return {
          x: dr.left + dr.width / 2 - srect.left - prevX,
          y: dr.top + dr.height / 2 - srect.top - prevY,
        };
      });

      const frame = physics.stepFrame(now, { cursor, homes }, out);

      // Writes.
      dots.forEach((dot, i) => {
        const pose = frame.poses[i];
        dot.style.transform = `translate(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px)`;
        dot.style.scale = frame.scales[i] === "1" ? "" : frame.scales[i];
      });

      if (debug) {
        ensureDebug(dots.length);
        const cross = dbg!.querySelector<HTMLElement>(".sdv-debug-cross");
        cross.style.left = `${cursor.x}px`;
        cross.style.top = `${cursor.y}px`;
        dbg!.querySelectorAll<HTMLElement>(".sdv-debug-home").forEach((h, k) => {
          h.style.left = `${homes[k].x}px`;
          h.style.top = `${homes[k].y}px`;
        });
        const nowMs_ = performance.now();
        if (nowMs_ - lastReadout > 150) {
          lastReadout = nowMs_;
          setLiveReadout(
            `click row = capture · cursor(${cursor.x.toFixed(1)}, ${cursor.y.toFixed(1)}) · ` +
              `home0(${homes[0].x.toFixed(1)}, ${homes[0].y.toFixed(1)}) · ` +
              `locked ${frame.snapIndex === -1 ? "none" : "dot" + frame.snapIndex}`,
          );
        }
      }

      raf = requestAnimationFrame(tick);
    };

    if (springs && !reducedMotion) {
      raf = requestAnimationFrame(tick);
    } else {
      // Static: clear any residual pose.
      dots = Array.from(scope.querySelectorAll<HTMLElement>(".h-1.w-1, .t3team-aci-cell"));
      dots.forEach((dot) => {
        dot.style.transform = "";
        dot.style.scale = "";
      });
    }
    return () => {
      cancelAnimationFrame(raf);
      dots.forEach((dot) => {
        dot.style.transform = "";
        dot.style.scale = "";
      });
      dbg?.remove();
    };
  }, [springs, reducedMotion, debug]);

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
      const cursorText = cursor
        ? `cursor(${cursor.x.toFixed(1)}, ${cursor.y.toFixed(1)})`
        : "cursor(n/a)";
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
    <div className="flex w-full flex-col items-center gap-8 px-12 py-10 pb-16">
      {reducedMotion ? (
        <style>{`.sdv-solo .h-1.w-1, .sdv-mixed .h-1.w-1, .sdv-mixed .t3team-aci-dot, .sdv-mixed .t3team-aci-cell, .sdv-mixed .t3team-aci-cell > span::before, .sdv-mixed .t3team-aci-cell > span::after, .t3team-aci-pulse { animation: none !important; } .sdv-mixed .t3team-aci-dot, .sdv-solo .h-1.w-1 { opacity: 0.4 !important; box-shadow: none !important; } .sdv-lead { transition: none !important; } .sdv-lead .t3team-aci-flip-in, .sdv-lead .t3team-aci-flip-out { animation: none !important; }`}</style>
      ) : null}

      <div className="flex w-full items-start justify-center gap-6">
        <div className="flex flex-col gap-8">
          <Card
            title="Baseline — current production working row (unmodified)"
            footnote="The real WorkingTimelineRow: three staggered pulses + #208 state word + GHE #201 agent dots + flip label. No scope classes — nothing here is overridden."
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
            footnote="Per-agent: thinking = cool wave · working = warm snappy pulses · waiting = muted breath (+ ring) · settled = dim still. Click a dot to open its thread on the side. Hover: S-bend avoidance + grow-on-lock."
          >
            <div className="rounded-lg border border-border/50 bg-card p-4">
              <div className="mb-3 rounded-md bg-accent/60 px-3 py-2 text-sm">
                Refactor the settings panel to use the new schema
              </div>
              <div
                ref={mixedScopeRef}
                className={`relative ${ring ? "sdv-ring" : ""} ${springs && !reducedMotion ? "sdv-springs" : ""} ${colorShifts && !reducedMotion ? "sdv-hue" : ""} sdv-solo sdv-mixed sdv-st-${threadForMixed ?? "settled"}`}
                onPointerMove={
                  springs && !reducedMotion
                    ? (event) => {
                        pointerRef.current = {
                          ...pointerRef.current,
                          x: event.clientX,
                          y: event.clientY,
                          active: true,
                        };
                      }
                    : undefined
                }
                onPointerLeave={
                  springs && !reducedMotion
                    ? () => {
                        pointerRef.current.active = false;
                      }
                    : undefined
                }
              >
                <RealWorkingRow
                  activeAgents={entries}
                  workingStepLabel={label}
                  onOpenAgents={() => {}}
                  threadState={threadForMixed}
                />
                {leadAnchor
                  ? createPortal(
                      <LeadText
                        word={threadForMixed === null ? "Working" : stateWordOf(threadForMixed)}
                        time={formatElapsed(WORKING_ROW.createdAt, nowMs)}
                      />,
                      leadAnchor,
                    )
                  : null}
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
                  thread: {threadForMixed === null ? "Working" : stateWordOf(threadForMixed)} ·
                  agents:{" "}
                  {entries
                    .slice(0, 5)
                    .map((_, i) => driftState.agents[i] ?? "working")
                    .join(" · ")}
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
    frozenClock: false,
  },
  argTypes: {
    threadState: {
      control: "select",
      options: ["auto", "thinking", "writing", "working", "waiting", "settled"],
      description:
        "Pins the THREAD-level state (progress dots + state word). 'auto' lets it drift with the agents.",
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
      description: "Integration: a waiting agent dot gets one soft breathing ring (spring easing).",
    },
    debug: {
      control: "checkbox",
      name: "Debug alignment",
      description:
        "Draws the raw pointer crosshair and a dashed ring at every dot's true home, so you can verify trigger vs pointer vs home pixel-by-pixel. Clicks also capture snapshots.",
    },
    springs: {
      control: "boolean",
      description:
        "S-bend + snap (real mouse): the row avoids the cursor on the vertical axis — one side eases up, the other down (an S along the horizontal axis); dots keep their x-pitch so they never approach each other, near-cursor dots shrink in anticipation. When the cursor sits on a dot's home, that one dot alone locks back to its original spot and grows until the cursor leaves.",
    },
    colorShifts: {
      control: "boolean",
      description:
        "Subtle per-dot hue wander at rest; a bigger one-shot hue swing when an agent's status changes.",
    },
    reducedMotion: {
      control: "boolean",
      description: "Force the reduced-motion fallback (static dim dots).",
    },
  },
} satisfies Meta<typeof StateMotionDots>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StateMotion: Story = {
  name: "State-motion dots (mixed, drifting)",
  args: {
    threadState: "auto",
    drift: true,
    ring: true,
    springs: true,
    colorShifts: true,
    debug: false,
  },
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
