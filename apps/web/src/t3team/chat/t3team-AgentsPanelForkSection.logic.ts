/**
 * Pure logic for the t3team Agents panel sub-runs section (see
 * `t3team-AgentsPanelForkSection.tsx`): building the child-thread tree and
 * ordering it by status priority. Kept out of the presentation component so
 * the panel stays small; the panel's "N idle · expand" collapsing and the
 * nested indentation live in `t3team-AgentsPanelSubRunTree.tsx`.
 */
import type { AgentPanelModel } from "@t3tools/client-runtime/state/subagentRuntime";

import type { T3TeamActiveWorkflowDockItem } from "~/t3team/chat/t3team-activeWorkflowDock";
import type { ProjectThread } from "~/t3team/t3team-types";
import { compareSubRunThreads } from "~/t3team/components/t3team-projectSidebarThreadTree";
import { resolveActivityPillDisplay } from "~/t3team/t3team-activityStateDisplay";

/**
 * The VARIANTS decision (2026-09-08 agents-panel UX) — variant 1, "one source of truth":
 * the roster already renders a workflow run's own name + phase + members, so re-listing that
 * same run as a "Recipe workflows" row directly under it is the duplication PJ screenshotted
 * (the panel's Recipe section and the composer dock share `deriveT3TeamActiveWorkflowDockItems`
 * by design; the SECTION inside the panel is the redundant one). These pure helpers let the
 * caller drop dock items the panel model already covers, WITHOUT touching the shared dock
 * derivation the composer still needs.
 */
/** Every run id the panel model's workflow groups already render (group + member run handles). */
export function panelModelRunIds(model: AgentPanelModel): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const group of model.workflows) {
    for (const agent of [
      group.workflow,
      ...group.unphasedMembers,
      ...group.phases.flatMap((p) => p.members),
    ]) {
      const runId = agent.runHandles?.runId;
      if (runId) ids.add(runId);
      if (agent.kind === "workflow") ids.add(agent.id);
    }
  }
  return ids;
}

/** Dock items that the panel roster does NOT already render — the deduped Recipe-workflows list. */
export function filterWorkflowRunsForForkSection(
  runs: ReadonlyArray<T3TeamActiveWorkflowDockItem>,
  model: AgentPanelModel,
): ReadonlyArray<T3TeamActiveWorkflowDockItem> {
  const covered = panelModelRunIds(model);
  return covered.size === 0 ? runs : runs.filter((item) => !covered.has(item.runId));
}

export type SubRunOpenCallback = (input: {
  readonly projectId: string;
  readonly threadId: string;
}) => void;

export interface SubRunNode {
  readonly thread: ProjectThread;
  readonly children: ReadonlyArray<SubRunNode>;
}

/**
 * Recursively build the sub-run tree under `rootThreadId` from the parentId->children map.
 * Cycle-guarded: a thread that reappears on its own ancestor path (or maps back to the root)
 * contributes no children, so a malformed relation can never hang the render.
 */
export function buildSubRunTree(
  rootThreadId: string,
  childThreadsByParentId: ReadonlyMap<string, ReadonlyArray<ProjectThread>>,
): SubRunNode[] {
  const build = (parentId: string, ancestors: ReadonlySet<string>): SubRunNode[] =>
    (childThreadsByParentId.get(parentId) ?? []).map((thread) => ({
      thread,
      children:
        ancestors.has(thread.id) || thread.id === rootThreadId
          ? []
          : build(thread.id, new Set(ancestors).add(thread.id)),
    }));
  return build(rootThreadId, new Set([rootThreadId]));
}

/**
 * Stable sub-run ordering, identical to the sidebar's sub-run list
 * (`compareSubRunThreads` in `t3team-projectSidebarThreadTree.ts`): lifecycle groups first
 * (running, waiting/error, idle, settled), then createdAt newest-first with an id tiebreak.
 * Activity NEVER reorders the list — a row holds its position from open until settled, so the
 * panel only reorders at lifecycle transitions, never on a message. The panel caps how many
 * rows render at once (see `t3team-AgentsPanelSubRunTree.tsx`), so the top of this order is
 * the active set the user wants to see.
 */
export function sortSubRunNodes(nodes: ReadonlyArray<SubRunNode>): SubRunNode[] {
  return nodes.toSorted((a, b) => compareSubRunThreads(a.thread, b.thread));
}

/**
 * The stable status labels of the panel sub-run rows (pre-live-state, kept as the
 * resolver's fallback tier).
 */
export const SUB_RUN_STATUS_LABEL: Record<ProjectThread["status"], string> = {
  idle: "Idle",
  running: "Running",
  completed: "Completed",
  error: "Error",
};

/**
 * The live status TEXT of a panel sub-run/agent row — the SAME shared resolution the
 * sidebar sub-run rows use (`resolveActivityPillDisplay` over the same
 * `activityLabel`/`activityState` fields, so the panel and the sidebar never
 * disagree at this seam): the LLM activity label REPLACES the state word when it
 * flows (only while the `t3teamActivityLabelsEnabled` flag is on — the caller gates
 * the flag here, mirroring t3team-SidebarSubRunRow), the deterministic state word
 * (Thinking/Writing/Working/Waiting) stands alone when there is no label, and the
 * stable status label is the fallback for settled states and old servers. Dots are
 * unaffected (they carry the 4-state + settled visuals).
 */
export function resolveSubRunStatusLabel(
  thread: Pick<ProjectThread, "status" | "activityLabel" | "activityState">,
  options: { readonly activityLabelsEnabled: boolean },
): string {
  const label = SUB_RUN_STATUS_LABEL[thread.status];
  if (thread.status !== "running") return label;
  return resolveActivityPillDisplay({
    label,
    activityState: thread.activityState ?? null,
    activityLabel: options.activityLabelsEnabled ? (thread.activityLabel ?? null) : null,
  });
}
