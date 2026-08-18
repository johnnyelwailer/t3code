/**
 * The broker-owned work-item DRAFT tools, made callable from a workflow body's `getTools()` tree —
 * plus, as of the `thread.handoff` seam, the ASSEMBLY point that combines this family with the
 * thread-handoff family (`t3team-workflowHostHandoffTools.ts`) into the single client and combined
 * run options every consumer (`t3team-workflowEngineController.ts`,
 * `t3team-workflowRehydrateRun.ts`, `t3team-thread-recipe-workflow-routes.ts`) already wires up
 * under these two exported names. Consumers do not need to know a second family exists; adding a
 * third means adding its ids to the two lists below, not touching any consumer.
 *
 * `defineTool` refs live in the SDK registry while the t3team capability surface is dispatched by
 * string id through {@link ./t3team-toolBrokerBinding.ts}; this module (together with the shared
 * builder in `t3team-workflowHostToolClientShared.ts`) is the seam between them, deliberately
 * narrow per family — only the work-item draft family and the thread-handoff family, never the
 * whole broker surface. A draft tool cannot write anything; it builds a proposal a human accepts in
 * the review UI. A handoff tool starts a new thread, which is immediately visible to the user the
 * moment it happens. Both are safe to hand to an orchestration body for the same reason: neither
 * can act silently.
 *
 * WHICH THREAD THE PROPOSAL LANDS ON: the client binds the LAUNCH thread per call, and a
 * thread-bound binding carries `publishDraft` pinned to that same thread id (`t3team-toolBrokerLive.ts`
 * → `makeT3TeamDraftMutationPublisher({ threadId, … })`), so the hidden `draft-mutation` carrier
 * message reaches the thread the user launched from — the one whose `ThreadChatView` ingests drafts.
 * Binding per call (not once at launch) also reads the thread's CURRENT tool context, like an agent
 * turn does, and re-applies the recipe's `allowedToolGroups` every time.
 *
 * Three gates apply, all pre-existing: the body must declare the group in `meta.capabilities`
 * (`assertToolGroupDeclared`), the id must be in the thread's tool context (`availableToolIdSet`),
 * and the recipe's `allowedToolGroups` filters what survives.
 *
 * @module t3team-workflowHostDraftTools
 */

import { defineToolGroup, type T3TeamToolHandlerClient, type ToolRef } from "@t3team/sdk";

import type { T3TeamToolBrokerShape } from "./t3team-toolBroker.ts";
import {
  T3TEAM_WORKFLOW_HOST_HANDOFF_TOOL_REFS,
  HOST_HANDOFF_TOOL_ID_SET,
} from "./t3team-workflowHostHandoffTools.ts";
import {
  combinedHostToolRunOptions,
  hostBridgedToolRef,
  makeT3TeamWorkflowHostToolClient,
} from "./t3team-workflowHostToolClientShared.ts";

/**
 * Reuses the id of the broker-side draft classification (`PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP`)
 * so bodies, the permission UI and the audit log speak ONE vocabulary.
 */
export const T3TEAM_WORKFLOW_DRAFT_TOOL_GROUP = defineToolGroup({
  id: "mutation.draft",
  label: "Propose work-item drafts",
  description:
    "Prepare reviewable work-item drafts (description, comment, assignee, estimate, status, subtask, links). A human accepts the draft before anything is written to the tracker.",
});

/** The exact broker tool ids reachable from a workflow body. Nothing outside this list is. */
export const T3TEAM_WORKFLOW_HOST_DRAFT_TOOL_IDS = [
  "t3team.work_item.description.draft_update",
  "t3team.work_item.comment.draft_create",
  "t3team.work_item.assignee.draft_update",
  "t3team.work_item.estimate.draft_update",
  "t3team.work_item.status.draft_update",
  "t3team.work_item.subtask.draft_create",
  "t3team.work_item.link.draft_create",
  "t3team.work_item.link.draft_remove",
] as const;

const HOST_DRAFT_TOOL_ID_SET: ReadonlySet<string> = new Set(T3TEAM_WORKFLOW_HOST_DRAFT_TOOL_IDS);

/** Every id from every family this module's client and run options admit. Grows when a new family
 * is bridged; nothing else needs to change at the consumer call sites. */
const HOST_TOOL_ID_SET: ReadonlySet<string> = new Set([
  ...HOST_DRAFT_TOOL_ID_SET,
  ...HOST_HANDOFF_TOOL_ID_SET,
]);

/** Registered ONCE at module load — `defineTool` refuses a duplicate id, and the engine executes a
 * tool by looking its id up in that global registry, so per-run refs would never be reached. The
 * per-run part is the `ctx.t3team` client the handlers read. */
export const T3TEAM_WORKFLOW_HOST_DRAFT_TOOL_REFS: ReadonlyArray<ToolRef<unknown, unknown>> =
  T3TEAM_WORKFLOW_HOST_DRAFT_TOOL_IDS.map((id) =>
    hostBridgedToolRef({ id, group: T3TEAM_WORKFLOW_DRAFT_TOOL_GROUP }),
  );

/**
 * The per-run host bridge, shared by the draft AND handoff families (see module doc). `undefined`
 * for a headless run: with no launch thread there is no binding to reach and nowhere a proposal or
 * a new session could be reviewed, so the refs stay bound but each call reports exactly that
 * instead of acting into a void.
 */
export function makeT3TeamWorkflowHostDraftToolClient(input: {
  readonly broker: T3TeamToolBrokerShape;
  readonly launchThreadId: string | undefined;
  readonly allowedToolGroups?: ReadonlyArray<string> | undefined;
}): T3TeamToolHandlerClient | undefined {
  return makeT3TeamWorkflowHostToolClient({ ...input, allowedToolIds: HOST_TOOL_ID_SET });
}

/** The run-option fragment for a launch, combining the draft refs and the handoff refs so both
 * families are reachable wherever this is spread into `WorkflowRunOptions`. */
export function t3teamWorkflowHostToolRunOptions(client: T3TeamToolHandlerClient | undefined): {
  readonly tools: ReadonlyArray<ToolRef<unknown, unknown>>;
  readonly t3team?: T3TeamToolHandlerClient;
} {
  return combinedHostToolRunOptions(client, [
    T3TEAM_WORKFLOW_HOST_DRAFT_TOOL_REFS,
    T3TEAM_WORKFLOW_HOST_HANDOFF_TOOL_REFS,
  ]);
}
