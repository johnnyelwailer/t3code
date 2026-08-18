/**
 * The broker-owned thread HANDOFF tool, made callable from a workflow body's `getTools()` tree.
 *
 * Mirrors `t3team-workflowHostDraftTools.ts` — same seam shape, different family: this one bridges
 * only `t3team.thread.start_child`, never the whole broker surface. Starting a child thread is
 * safe to hand to an orchestration body for the same reason a draft is: the effect is immediately
 * VISIBLE to the user (a new session appears) rather than a silent write, so a body cannot use it
 * to do anything the user wouldn't see happen.
 *
 * The actual per-run client and run-option binding live in the shared, family-agnostic builder
 * (`t3team-workflowHostToolClientShared.ts`) — this module only declares WHICH ids belong to the
 * `thread.handoff` family and registers their refs.
 *
 * @module t3team-workflowHostHandoffTools
 */

import { defineToolGroup, type ToolRef } from "@t3team/sdk";

import { hostBridgedToolRef } from "./t3team-workflowHostToolClientShared.ts";

/**
 * Reuses the id of the recipe-side handoff classification
 * (`PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP`, `packages/project-recipes/src/toolGroups.ts`) so
 * bodies, the permission UI and the audit log speak ONE vocabulary.
 */
export const T3TEAM_WORKFLOW_HANDOFF_TOOL_GROUP = defineToolGroup({
  id: "thread.handoff",
  label: "Start a child session",
  description:
    "Start a new child thread to hand off work, visible to the user as a new session the moment it starts.",
});

/** The exact broker tool ids reachable from a workflow body. Nothing outside this list is. */
export const T3TEAM_WORKFLOW_HOST_HANDOFF_TOOL_IDS = ["t3team.thread.start_child"] as const;

export const HOST_HANDOFF_TOOL_ID_SET: ReadonlySet<string> = new Set(
  T3TEAM_WORKFLOW_HOST_HANDOFF_TOOL_IDS,
);

/** Registered ONCE at module load — `defineTool` refuses a duplicate id, and the engine executes a
 * tool by looking its id up in that global registry, so per-run refs would never be reached. The
 * per-run part is the `ctx.t3team` client the shared handler reads. */
export const T3TEAM_WORKFLOW_HOST_HANDOFF_TOOL_REFS: ReadonlyArray<ToolRef<unknown, unknown>> =
  T3TEAM_WORKFLOW_HOST_HANDOFF_TOOL_IDS.map((id) =>
    hostBridgedToolRef({ id, group: T3TEAM_WORKFLOW_HANDOFF_TOOL_GROUP }),
  );
