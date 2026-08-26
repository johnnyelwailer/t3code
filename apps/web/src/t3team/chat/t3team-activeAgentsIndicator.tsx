import { useEffect, useRef, useState } from "react";
import { setActiveAgentHover, type ActiveAgentEntry } from "~/t3team/chat/t3team-activeAgentsCore";

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
}: {
  entries: readonly ActiveAgentEntry[];
  onOpenAgents: () => void;
}) {
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

  const visible = entries.slice(0, MAX_VISIBLE_DOTS);
  const overflow = entries.length - visible.length;
  const groupLabel = `${entries.length} active agent${entries.length === 1 ? "" : "s"} — open agents`;

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={groupLabel}
      title={groupLabel}
      onClick={onOpenAgents}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenAgents();
        }
      }}
      className="ml-2 inline-flex h-[1em] shrink-0 -translate-y-[3px] cursor-pointer items-center rounded-sm align-middle outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                onOpenAgents();
              }}
              onMouseEnter={() => setActiveAgentHover(entry)}
              onMouseLeave={() => setActiveAgentHover(null)}
              onFocus={() => setActiveAgentHover(entry)}
              onBlur={() => setActiveAgentHover(null)}
              className="t3team-aci-cell inline-flex size-3 items-center justify-center"
            >
              {/* Keyed remount replays the one-shot pendulum on each event. */}
              <span
                key={`pulse-${pulse}`}
                className={pulse > 0 ? "t3team-aci-pulse relative" : "relative"}
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
