import type { RuntimeSubagent } from "@t3tools/client-runtime/state/subagentRuntime";
import type { ProviderDriverKind } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";
import { resolveSubRunStatusLabel } from "~/t3team/chat/t3team-AgentsPanelForkSection.logic";
import type { ProjectThread } from "~/t3team/t3team-types";

/**
 * GHE #201 — compact ACTIVE-agents indicator for the conversation working row.
 *
 * Merges the two live-agent sources of a thread:
 * - child threads that are running (`ProjectThread.status === "running"`), and
 * - in-thread subagents that are live (status `running` | `waiting`), as
 *   `projectedSubagentsToRuntime(projection.subagents)` presents them.
 *
 * One still dot per active agent (T3TeamActiveAgentsIndicator); hovering a
 * dot flips the working row's step label to that agent's live status
 * (T3TeamActiveAgentsStepLabel). This file is the shared core: the merged
 * entry model and the hover coordination.
 */

export interface ActiveAgentEntry {
  readonly id: string;
  readonly source: "child" | "subagent";
  readonly title: string;
  /** #40-style live label: what this agent is doing right now. */
  readonly statusLabel: string;
  /** Changes on every live-output event; drives the one-shot dot pulse. */
  readonly activityKey: string;
  /** GHE #201 follow-up: this agent's dot state (textures the indicator dot). */
  readonly dotState: DotState;
  /** Driver mark for the chip. Absent when the child has no provider instance. */
  readonly provider?: {
    readonly driverKind: ProviderDriverKind;
    readonly displayName: string;
    readonly iconDataUrl?: string | undefined;
    readonly acpRegistryIconUrl?: string | undefined;
  };
}

/**
 * GHE #201 follow-up — the per-agent dot states for the state-textured
 * indicator dots. Production has no per-agent state enum, so the dot state
 * is classified from the live label the app already tracks:
 * read-ish → thinking, write-ish → writing, waiting → waiting,
 * everything else → working. `settled` is reserved (the story exploration's
 * fourth-and-fifth state); active agents are never settled in production.
 */
export type DotState = "thinking" | "writing" | "working" | "waiting" | "settled";

export function deriveDotState({
  label,
  status,
}: {
  readonly label?: string | null | undefined;
  readonly status?: string | null | undefined;
}): DotState {
  if (status === "waiting") return "waiting";
  const text = (label ?? "").toLowerCase();
  if (!text) return "working";
  if (/read|search|browse|analyz|investigat|examin/.test(text)) return "thinking";
  if (/edit|writ|patch|creat|draft|implement|author/.test(text)) return "writing";
  return "working";
}

export const EMPTY_ACTIVE_AGENTS: readonly ActiveAgentEntry[] = [];

function subagentStatusLabel(agent: RuntimeSubagent): string {
  if (agent.status === "waiting") return "Waiting";
  return agent.progress ?? agent.lastToolName ?? "Working";
}

/** A child still owes the parent work: running, spinning up, or waiting on its own agents. */
function childIsActive(thread: ProjectThread): boolean {
  if (thread.status === "error" || thread.shellRunStatus === "failed") return false;
  if (thread.status === "running" || thread.waitingOnChildren === true) return true;
  const shell = thread.shellRunStatus;
  return (
    shell === "preparing" ||
    shell === "starting" ||
    shell === "queued" ||
    shell === "running" ||
    shell === "waiting"
  );
}

export function mergeActiveAgentsAndChildren({
  childThreads,
  subagents,
  activityLabelsEnabled = true,
}: {
  childThreads: readonly ProjectThread[];
  subagents: readonly RuntimeSubagent[];
  activityLabelsEnabled?: boolean;
}): readonly ActiveAgentEntry[] {
  const entries: ActiveAgentEntry[] = [];
  for (const thread of childThreads) {
    if (!childIsActive(thread)) continue;
    const statusLabel = resolveSubRunStatusLabel(thread, { activityLabelsEnabled });
    entries.push({
      id: `child:${thread.id}`,
      source: "child",
      title: thread.title,
      statusLabel,
      activityKey: `${thread.childStatusUpdatedAt ?? ""}|${thread.lastMessageAt}|${thread.activityLabel ?? ""}|${statusLabel}`,
      dotState: deriveDotState({
        label: statusLabel,
        status:
          thread.shellRunStatus === "waiting" || thread.waitingOnChildren ? "waiting" : undefined,
      }),
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
      dotState: deriveDotState({ label: subagentStatusLabel(agent), status: agent.status }),
    });
  };
  for (const agent of subagents) pushSubagent(agent);
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

/**
 * GHE #410 — an `agent()` child's title and live status label are often the SAME text (e.g.
 * "Story step"), so the naive `${title} — ${statusLabel}` join reads as "Story step — Story
 * step". Drop the redundant half instead: just the title when the two agree once case and
 * surrounding whitespace are normalized away.
 */
export function formatActiveAgentLabel(title: string, statusLabel: string): string {
  return title.trim().toLowerCase() === statusLabel.trim().toLowerCase()
    ? title
    : `${title} — ${statusLabel}`;
}
