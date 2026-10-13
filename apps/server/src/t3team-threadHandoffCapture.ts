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
} from "@t3tools/provider-core/server/handoffBudget";

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

const unverified = (what: string): T3TeamThreadHandoffRefusal => ({
  reason: "unverified",
  message: `Couldn't verify ${what}, so nothing moved. Try again.`,
});

/**
 * Why this thread may not move now. Empty means eligible. An active run is NOT a refusal: the
 * client interrupts it (or waits for the turn) as part of the move. A check that could not be
 * read (`null`) refuses: unknown state never moves.
 */
export function threadHandoffRefusals(input: {
  readonly shell: Pick<OrchestrationV2ThreadShell, "branch" | "pendingRuntimeRequest">;
  readonly branchState: T3TeamThreadHandoffBranchState;
  readonly liveSubagentChildren: number | null;
  readonly boundScheduledTasks: number | null;
}): ReadonlyArray<T3TeamThreadHandoffRefusal> {
  const refusals: T3TeamThreadHandoffRefusal[] = [];
  const { unpushedCommits, uncommittedChanges, upstream } = input.branchState;
  const { branch } = input.shell;
  if (unpushedCommits === null) {
    refusals.push(unverified(`that ${branch ?? "this checkout"} is pushed`));
  } else if (branch !== null && upstream === null) {
    refusals.push({
      reason: "unpushed_commits",
      message: `${branch} is not pushed to origin. Push it first (git push -u origin ${branch}): the other machine checks out origin/${branch}.`,
    });
  } else if (unpushedCommits > 0) {
    refusals.push({
      reason: "unpushed_commits",
      message:
        upstream === null
          ? `This checkout has ${plural(unpushedCommits, "commit", "commits")} no remote has. Push first: unpushed work stays on this machine.`
          : `${plural(unpushedCommits, "commit", "commits")} on ${branch ?? "this branch"} ${unpushedCommits === 1 ? "is" : "are"} not pushed to ${upstream}. Push first: unpushed work stays on this machine.`,
    });
  }
  if (uncommittedChanges === null) {
    refusals.push(unverified("that the checkout has no uncommitted changes"));
  } else if (uncommittedChanges) {
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
  if (input.liveSubagentChildren === null) {
    refusals.push(unverified("that no subagents are still working under this thread"));
  } else if (input.liveSubagentChildren > 0) {
    refusals.push({
      reason: "live_subagent_children",
      message: `${plural(input.liveSubagentChildren, "subagent is", "subagents are")} still working under this thread.`,
    });
  }
  if (input.boundScheduledTasks === null) {
    refusals.push(unverified("which scheduled tasks run in this thread"));
  } else if (input.boundScheduledTasks > 0) {
    refusals.push({
      reason: "scheduled_task_bound",
      message: `${plural(input.boundScheduledTasks, "scheduled task runs", "scheduled tasks run")} in this thread and cannot move with it.`,
    });
  }
  return refusals;
}
