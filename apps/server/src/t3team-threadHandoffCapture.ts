/**
 * Pure parts of the thread handoff capture (`t3team.threadHandoff.prepare`): the
 * `full_thread_summary` text, built with the context-handoff engine's own selection and
 * rendering (same budget, same history format as a provider switch), and the eligibility
 * verdict. Nothing here reads or writes state.
 * @module t3team-threadHandoffCapture
 */
import type {
  OrchestrationV2Run,
  OrchestrationV2ThreadShell,
  OrchestrationV2TurnItem,
  T3TeamThreadHandoffBranchState,
  T3TeamThreadHandoffRefusal,
} from "@t3tools/contracts";

import {
  handoffCoverage,
  historicalMessagesWithRunStatus,
  renderHistory,
  selectHistory,
} from "./orchestration-v2/ContextHandoffBudget.ts";

/** The whole transcript as a budgeted `full_thread_summary`, exactly as a provider handoff renders it. */
export function renderThreadHandoffSummary(input: {
  readonly threadId: string;
  readonly runs: ReadonlyArray<Pick<OrchestrationV2Run, "id" | "status" | "ordinal">>;
  readonly items: ReadonlyArray<OrchestrationV2TurnItem>;
  readonly budget: number;
}): string {
  const ordinals = input.runs.map((run) => run.ordinal);
  const coverage = handoffCoverage({
    threadId: input.threadId,
    coveredRunOrdinals: {
      from: ordinals.length === 0 ? 1 : Math.min(...ordinals),
      to: ordinals.length === 0 ? 1 : Math.max(...ordinals),
    },
    items: input.items,
  });
  const selected = selectHistory({
    messages: historicalMessagesWithRunStatus(input.items, input.runs),
    coverage,
    budget: input.budget,
  });
  return renderHistory(selected.messages, selected.context);
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Why this thread may not move now. Empty means eligible. An active run is NOT a refusal: the
 * client interrupts it (or waits for the turn) as part of the move.
 */
export function threadHandoffRefusals(input: {
  readonly shell: Pick<OrchestrationV2ThreadShell, "branch" | "pendingRuntimeRequest">;
  readonly branchState: T3TeamThreadHandoffBranchState;
  readonly liveSubagentChildren: number;
  readonly boundScheduledTasks: number;
}): ReadonlyArray<T3TeamThreadHandoffRefusal> {
  const refusals: T3TeamThreadHandoffRefusal[] = [];
  const { unpushedCommits, uncommittedChanges, upstream } = input.branchState;
  if (unpushedCommits !== null && unpushedCommits > 0) {
    const where = input.shell.branch ?? "this branch";
    refusals.push({
      reason: "unpushed_commits",
      message:
        upstream === null
          ? `${where} is not pushed (${plural(unpushedCommits, "local commit", "local commits")}). Push it first: the other machine checks out from the remote.`
          : `${plural(unpushedCommits, "commit", "commits")} on ${where} ${unpushedCommits === 1 ? "is" : "are"} not pushed to ${upstream}. Push first: unpushed work stays on this machine.`,
    });
  }
  if (uncommittedChanges === true) {
    refusals.push({
      reason: "uncommitted_changes",
      message: "The checkout has uncommitted changes. Commit and push them first.",
    });
  }
  if (input.shell.pendingRuntimeRequest !== null) {
    refusals.push({
      reason: "pending_user_input",
      message: "The thread is waiting for your answer. Answer or dismiss it first.",
    });
  }
  if (input.liveSubagentChildren > 0) {
    refusals.push({
      reason: "live_subagent_children",
      message: `${plural(input.liveSubagentChildren, "subagent is", "subagents are")} still working under this thread.`,
    });
  }
  if (input.boundScheduledTasks > 0) {
    refusals.push({
      reason: "scheduled_task_bound",
      message: `${plural(input.boundScheduledTasks, "scheduled task runs", "scheduled tasks run")} in this thread and cannot move with it.`,
    });
  }
  return refusals;
}
