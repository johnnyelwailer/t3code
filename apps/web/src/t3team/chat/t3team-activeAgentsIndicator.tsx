import { useEffect, useRef, useState } from "react";
import { setActiveAgentHover, type ActiveAgentEntry } from "~/t3team/chat/t3team-activeAgentsCore";
import { createSBendPhysics, type SBendOut } from "~/t3team/chat/t3team-activeAgentsPhysics";

/**
 * GHE #201 — the dots of the active-agents indicator, rendered directly
 * after "Working for …" in the conversation working row.
 *
 * One still dot per active agent; dots are completely still between events.
 * When an agent's live activity changes (activityKey), its dot performs ONE
 * slow pendulum move and its brightness decays (recency). 5 dots max, then
 * "+n". Hover scales the dot up (and flips the step label — separate
 * component, shared hover store). Group click opens the Agents panel.
 */

const DOT_HUE_CLASSES = [
  "bg-sky-500 dark:bg-sky-300/90",
  "bg-cyan-500 dark:bg-cyan-300/90",
  "bg-violet-500 dark:bg-violet-300/90",
  "bg-fuchsia-500 dark:bg-fuchsia-300/90",
  "bg-amber-500 dark:bg-amber-300/90",
] as const;

const MAX_VISIBLE_DOTS = 5;

export function T3TeamActiveAgentsIndicator({
  entries,
  onOpenAgents,
  onOpenAgent,
}: {
  entries: readonly ActiveAgentEntry[];
  onOpenAgents: () => void;
  /**
   * GHE #201 follow-up: per-dot open. When provided, clicking a dot opens
   * THAT agent (its thread / agent view) instead of the whole Agents panel.
   */
  onOpenAgent?: ((entry: ActiveAgentEntry) => void) | undefined;
}) {
  const groupRef = useRef<HTMLSpanElement | null>(null);
  const [pulseCounts, setPulseCounts] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [hotIds, setHotIds] = useState<ReadonlySet<string>>(() => new Set());
  const seenActivity = useRef<ReadonlyMap<string, string> | null>(null);
  const decayTimers = useRef<Map<string, number>>(new Map());

  // Event detection: when a merged entry's activityKey changes, replay its
  // one-shot pendulum and open the ~1.2s hot-brightness window.
  useEffect(() => {
    const prev = seenActivity.current;
    const next = new Map<string, string>();
    const fired: string[] = [];
    for (const entry of entries) {
      next.set(entry.id, entry.activityKey);
      const before = prev?.get(entry.id);
      if (before !== undefined && before !== entry.activityKey) fired.push(entry.id);
    }
    seenActivity.current = next;
    if (fired.length === 0) return;
    setPulseCounts((counts) => {
      const updated = new Map(counts);
      for (const id of fired) updated.set(id, (updated.get(id) ?? 0) + 1);
      return updated;
    });
    setHotIds((current) => new Set([...current, ...fired]));
    // One decay timer PER entry id, reset when that entry fires again. A
    // single shared timer would be cleared by this effect's cleanup on the
    // next event and leak the hot (bright) state of entries that didn't
    // refire (the review's "brightness-decay leak under live event streams").
    const timers = decayTimers.current;
    for (const id of fired) {
      const pending = timers.get(id);
      if (pending !== undefined) clearTimeout(pending);
      timers.set(
        id,
        window.setTimeout(() => {
          timers.delete(id);
          setHotIds((current) => {
            const updated = new Set(current);
            updated.delete(id);
            return updated;
          });
        }, 1200),
      );
    }
  }, [entries]);

  // Clear any pending decay timers on unmount.
  useEffect(() => {
    const timers = decayTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  // GHE #201 follow-up: S-bend + snap proximity. While the cursor is near
  // the row, the dots AVOID it on the Y axis — the row bends into an S
  // around the cursor's x (one side up, one side down) — and the cursor
  // sitting on a dot's home locks THAT one dot exactly at home and grows
  // it; near-cursor dots shrink in anticipation. The shared physics module
  // (t3team-activeAgentsPhysics) is the single source of truth; the
  // exploration story imports it too. Transforms are written on the cell
  // buttons; reduced-motion users get none of it (matchMedia + CSS).
  const visibleCount = Math.min(entries.length, MAX_VISIBLE_DOTS);
  useEffect(() => {
    const group = groupRef.current;
    if (!group || visibleCount === 0) return;
    if (
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    // The trigger scope is the whole working row (stamped by
    // WorkingTimelineRow), not the tiny dot group: the bend is meant to
    // start well before the cursor touches the dots.
    const scope = group.closest<HTMLElement>("[data-t3team-working-row]") ?? group;
    // Exploration stories can opt out per-card (data-sdv-no-springs on the
    // card scope, inherited down through the row).
    if (scope.closest("[data-sdv-no-springs]")) return;
    const physics = createSBendPhysics();
    const out: SBendOut = { poses: [], scales: [], snapIndex: -1 };
    // Viewport-space pointer; re-converted against a fresh scope rect every
    // frame because the layout moves under a still mouse.
    const pointer = { x: 0, y: 0, active: false };
    let raf = 0;
    let dots: HTMLElement[] = [];

    const tick = (now: number) => {
      // Perf: reuse the cached cell list; re-query only when the first one
      // left the tree (entries changed / virtualization).
      const firstDot = dots[0];
      if (!firstDot || !group.contains(firstDot)) {
        dots = Array.from(group.querySelectorAll<HTMLElement>(".t3team-aci-cell"));
        if (dots.length === 0) {
          raf = 0;
          return;
        }
      }
      // Reads batched (one reflow), writes after.
      const srect = scope.getBoundingClientRect();
      const cursor = {
        x: pointer.x - srect.left,
        y: pointer.y - srect.top,
        active: pointer.active,
      };
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
      dots.forEach((dot, i) => {
        const pose = frame.poses[i];
        if (!pose) return;
        const scale = frame.scales[i] ?? "1";
        dot.style.transform = `translate(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px)`;
        dot.style.scale = scale === "1" ? "" : scale;
      });
      // Keep the loop alive while anything is in motion; otherwise stop and
      // let a pointer event re-prime it (no idle rAF cost).
      const inMotion =
        cursor.active ||
        frame.snapIndex !== -1 ||
        out.scales.some((scale) => scale !== "1") ||
        frame.poses.some((pose) => Math.abs(pose.y) > 0.2);
      if (inMotion) raf = requestAnimationFrame(tick);
      else raf = 0;
    };

    const prime = () => {
      if (raf === 0) raf = requestAnimationFrame(tick);
    };
    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      prime();
    };
    const onLeave = () => {
      pointer.active = false;
      prime();
    };
    scope.addEventListener("pointermove", onMove, { passive: true });
    scope.addEventListener("pointerleave", onLeave, { passive: true });
    dots = []; // force a re-query for the current entries
    prime();
    return () => {
      scope.removeEventListener("pointermove", onMove);
      scope.removeEventListener("pointerleave", onLeave);
      if (raf !== 0) cancelAnimationFrame(raf);
      dots.forEach((dot) => {
        dot.style.transform = "";
        dot.style.scale = "";
      });
    };
  }, [visibleCount]);

  const visible = entries.slice(0, MAX_VISIBLE_DOTS);
  const overflow = entries.length - visible.length;
  const groupLabel = `${entries.length} active agent${entries.length === 1 ? "" : "s"} — open agents`;

  // No title attribute on the group: the native hover tooltip was redundant —
  // the working row already renders the status word + step label right next to
  // the dots, and hovering a dot flips that label to the agent's live status.
  // aria-label keeps the info for screen readers.
  return (
    <span
      ref={groupRef}
      role="button"
      tabIndex={0}
      aria-label={groupLabel}
      onClick={onOpenAgents}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenAgents();
        }
      }}
      // GHE #236 follow-up: no vertical nudge — the working row centers its
      // children (items-center), so the 14px group (dot centered in it)
      // already shares the status text's optical center. The old
      // -translate-y-[3px] + align-middle was tuned to the pre-GHE #238
      // baseline-aligned row and now double-compensates.
      className="ml-2 inline-flex h-[1em] shrink-0 items-center rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <span className="inline-flex h-full items-center gap-1">
        {visible.map((entry, i) => {
          const pulse = pulseCounts.get(entry.id) ?? 0;
          const hot = hotIds.has(entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              aria-label={`${entry.title} — ${entry.statusLabel}`}
              onClick={(event) => {
                event.stopPropagation();
                // GHE #201 follow-up: per-dot open — the clicked dot opens
                // its own agent when the app provides the seam.
                if (onOpenAgent) onOpenAgent(entry);
                else onOpenAgents();
              }}
              onMouseEnter={() => setActiveAgentHover(entry)}
              onMouseLeave={() => setActiveAgentHover(null)}
              onFocus={() => setActiveAgentHover(entry)}
              onBlur={() => setActiveAgentHover(null)}
              data-t3team-state={entry.dotState}
              style={{ "--t3team-aci-i": i } as React.CSSProperties}
              className="t3team-aci-cell inline-flex size-3 items-center justify-center"
            >
              {/* Keyed remount replays the one-shot pendulum on each event
                  AND the one-shot state-shift swing when dotState changes. */}
              <span
                key={`pulse-${pulse}-${entry.dotState}`}
                className={`t3team-aci-shift ${pulse > 0 ? "t3team-aci-pulse relative" : "relative"}`}
              >
                <span
                  className={`t3team-aci-dot inline-block ${DOT_HUE_CLASSES[i % DOT_HUE_CLASSES.length]} ${
                    hot ? "t3team-aci-hot" : ""
                  }`}
                />
              </span>
            </button>
          );
        })}
        {overflow > 0 ? (
          <span
            aria-hidden
            className="pl-0.5 text-[10px] font-medium leading-none tabular-nums text-sky-600 dark:text-sky-300/80"
          >
            +{overflow}
          </span>
        ) : null}
      </span>
    </span>
  );
}
