import type {
  AgentPanelModel,
  RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ProjectThread } from "~/t3team/t3team-types";

/**
 * GHE #201 — compact ACTIVE-agents indicator for the conversation working row.
 *
 * Merges the two live-agent sources of a thread:
 * - child threads that are running (`ProjectThread.status === "running"`), and
 * - in-thread subagents that are live (status `running` | `waiting`) from the
 *   agent panel model.
 *
 * One still dot per active agent. Dots are completely still between events;
 * when an agent's live activity changes, its dot performs ONE slow pendulum
 * move and its brightness decays (recency). Hover scales the dot up and flips
 * the working row's step label to that agent's live status (the label flips
 * back on unhover). Group click opens the Agents panel.
 */

export interface ActiveAgentEntry {
  readonly id: string;
  readonly source: "child" | "subagent";
  readonly title: string;
  /** #40-style live label: what this agent is doing right now. */
  readonly statusLabel: string;
  /** Changes on every live-output event; drives the one-shot dot pulse. */
  readonly activityKey: string;
}

export const EMPTY_ACTIVE_AGENTS: readonly ActiveAgentEntry[] = [];

function subagentStatusLabel(agent: RuntimeSubagent): string {
  if (agent.status === "waiting") return "Waiting";
  return agent.progress ?? agent.lastToolName ?? "Working";
}

export function mergeActiveAgentsAndChildren({
  childThreads,
  agentPanelModel,
}: {
  childThreads: readonly ProjectThread[];
  agentPanelModel: AgentPanelModel;
}): readonly ActiveAgentEntry[] {
  const entries: ActiveAgentEntry[] = [];
  for (const thread of childThreads) {
    if (thread.status !== "running") continue;
    entries.push({
      id: `child:${thread.id}`,
      source: "child",
      title: thread.title,
      statusLabel: thread.activityLabel ?? "Working",
      activityKey: `${thread.childStatusUpdatedAt ?? ""}|${thread.lastMessageAt}|${thread.activityLabel ?? ""}`,
    });
  }
  const pushSubagent = (agent: RuntimeSubagent) => {
    if (agent.status !== "running" && agent.status !== "waiting") return;
    entries.push({
      id: `agent:${agent.id}`,
      source: "subagent",
      title: agent.title,
      statusLabel: subagentStatusLabel(agent),
      activityKey: `${agent.updatedAt}|${agent.progress ?? ""}|${agent.lastToolName ?? ""}|${agent.status}`,
    });
  };
  for (const agent of agentPanelModel.directAgents) pushSubagent(agent);
  for (const group of agentPanelModel.workflows) {
    for (const phase of group.phases) {
      for (const member of phase.members) pushSubagent(member);
    }
    for (const member of group.unphasedMembers) pushSubagent(member);
  }
  return entries.length > 0 ? entries : EMPTY_ACTIVE_AGENTS;
}

// ---------------------------------------------------------------------------
// Hover coordination: the dots and the step label live in the same working
// row but are separate subtrees, so the hovered agent is shared through a
// tiny external store (the t3team idiom for cross-tree UI state).
// ---------------------------------------------------------------------------

let hoveredEntry: ActiveAgentEntry | null = null;
const hoverSubscribers = new Set<() => void>();

export function setActiveAgentHover(entry: ActiveAgentEntry | null): void {
  if (hoveredEntry === entry) return;
  hoveredEntry = entry;
  hoverSubscribers.forEach((listener) => listener());
}

export function useActiveAgentHover(): ActiveAgentEntry | null {
  return useSyncExternalStore(
    (subscribe) => {
      hoverSubscribers.add(subscribe);
      return () => {
        hoverSubscribers.delete(subscribe);
      };
    },
    () => hoveredEntry,
  );
}

// ---------------------------------------------------------------------------
// The dots
// ---------------------------------------------------------------------------

const DOT_HUE_CLASSES = [
  "bg-sky-500 dark:bg-sky-300/90",
  "bg-cyan-500 dark:bg-cyan-300/90",
  "bg-violet-500 dark:bg-violet-300/90",
  "bg-fuchsia-500 dark:bg-fuchsia-300/90",
  "bg-amber-500 dark:bg-amber-300/90",
] as const;

const MAX_VISIBLE_DOTS = 5;

/**
 * One still dot per active agent, directly after "Working for …" in the
 * working row. 5 dots max, then "+n".
 */
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
    const timer = setTimeout(() => {
      setHotIds((current) => {
        const updated = new Set(current);
        for (const id of fired) updated.delete(id);
        return updated;
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [entries]);

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

// ---------------------------------------------------------------------------
// The step label: debounced base + hover override, sequential FLIP switch
// ---------------------------------------------------------------------------

function useDebouncedValue(value: string, ms: number): string {
  const [stable, setStable] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setStable(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return stable;
}

/**
 * "· <label>" for the working row. The base value (the plan step label) is
 * debounced 900ms so fast intermediate updates never flicker; hovering an
 * agent dot flips the SAME label to that agent's live status instead of
 * appending text. The switch is sequential FLIP: the old text rotates fully
 * out first, then the new text rotates in. One line, ellipsis-clamped, so
 * the row layout never shifts.
 */
export function T3TeamActiveAgentsStepLabel({ label }: { label: string | null }) {
  const hover = useActiveAgentHover();
  const stable = useDebouncedValue(label ?? "", 900);
  const target = hover ? `${hover.title} — ${hover.statusLabel}` : stable;
  const [shown, setShown] = useState(target);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");

  useEffect(() => {
    if (target === shown) {
      setPhase("idle");
      return;
    }
    if (phase === "idle") setPhase("out");
  }, [target, shown, phase]);
  useEffect(() => {
    if (phase === "out") {
      const t = setTimeout(() => {
        setShown(target);
        setPhase("in");
      }, 460);
      return () => clearTimeout(t);
    }
    if (phase === "in") {
      const t = setTimeout(() => setPhase("idle"), 460);
      return () => clearTimeout(t);
    }
  }, [phase, target, shown]);

  if (target === "") return null;
  return (
    <span className="t3team-aci-step ml-2 text-muted-foreground/55">
      ·{" "}
      <span
        className={
          phase === "out"
            ? "t3team-aci-flip-out"
            : phase === "in"
              ? "t3team-aci-flip-in"
              : undefined
        }
      >
        {shown}
      </span>
    </span>
  );
}
