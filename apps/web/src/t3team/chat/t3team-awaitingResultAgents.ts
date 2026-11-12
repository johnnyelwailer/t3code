import type { OrchestrationV2Subagent } from "@t3tools/contracts";

import type { ActiveAgentEntry } from "~/t3team/chat/t3team-activeAgentsCore";

const TERMINAL_TASK_STATUSES: ReadonlySet<OrchestrationV2Subagent["status"]> = new Set([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

/**
 * Delegated tasks that finished while their parent agent's result is still in flight.
 *
 * An agent that delegates async ends its turn and is woken by the task's completion
 * (`completionDelivery`, see the Orchestrator's delegated-completion cohort). Between the task
 * finishing and that wake turn running, the parent has no active run and no live agent, so the
 * thread read as finished. `pending`/`claimed` is exactly that window: the result exists and has
 * not been delivered to, or read by, the parent yet. These ride the working row's agent chips as
 * `settled` dots, so the row stays up and says the agent is about to continue.
 */
export function deriveAwaitingResultEntries(
  subagents: ReadonlyArray<OrchestrationV2Subagent> | undefined,
): readonly ActiveAgentEntry[] {
  const entries: ActiveAgentEntry[] = [];
  for (const task of subagents ?? []) {
    if (task.origin !== "app_owned") continue;
    const delivery = task.completionDelivery?.state;
    if (delivery !== "pending" && delivery !== "claimed") continue;
    // A live task is already an active agent chip; only a terminal one is awaiting delivery.
    if (!TERMINAL_TASK_STATUSES.has(task.status)) continue;
    const outcome = task.status === "completed" ? "Finished" : "Failed";
    entries.push({
      id: `agent:${task.id}`,
      source: "subagent",
      title: task.title?.trim() || "Delegated task",
      statusLabel: `${outcome} · resuming the agent`,
      activityKey: `${task.id}|${task.status}|${delivery}`,
      dotState: "settled",
    });
  }
  return entries;
}

/** The chips of agents still doing work, without the finished tasks awaiting delivery. */
export function liveActiveAgents(
  entries: readonly ActiveAgentEntry[],
): readonly ActiveAgentEntry[] {
  return entries.some((entry) => entry.dotState === "settled")
    ? entries.filter((entry) => entry.dotState !== "settled")
    : entries;
}

/**
 * The working row's words once the thread's own turn has ended but it still owes the user a
 * continuation: who it waits for, or that the agent is about to resume with the results.
 */
export function awaitingAgentsLead(entries: readonly ActiveAgentEntry[]): string | null {
  const [first] = entries;
  if (first === undefined) return null;
  const live = entries.filter((entry) => entry.dotState !== "settled");
  const [firstLive] = live;
  if (firstLive === undefined) {
    return entries.length === 1
      ? `${first.title} finished · resuming`
      : `${entries.length} tasks finished · resuming`;
  }
  return live.length === 1 ? `Waiting for ${firstLive.title}` : `Waiting for ${live.length} agents`;
}
