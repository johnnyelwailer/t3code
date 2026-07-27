/**
 * The broker-owned work-item DRAFT tools, made callable from a workflow body's `getTools()` tree.
 *
 * `defineTool` refs live in the SDK registry while the t3team capability surface is dispatched by
 * string id through {@link ./t3team-toolBrokerBinding.ts}; this module is the seam between them,
 * deliberately narrow — only the work-item draft family, never the whole broker surface. A draft
 * tool cannot write anything; it builds a proposal a human accepts in the review UI, which is what
 * makes it the one family safe to hand to an orchestration body.
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

import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { defineTool, defineToolGroup, type T3TeamToolHandlerClient, type ToolRef } from "@t3team/sdk";

import {
  T3TEAM_MCP_SERVER_NAME,
  type T3TeamToolBrokerShape,
  type T3TeamToolCallResult,
} from "./t3team-toolBroker.ts";

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

/** Permissive on purpose: the broker already validates each draft tool's arguments and answers a
 * bad call specifically (`… requires issue_id.`). Restating those shapes here would be a second
 * copy of that contract, free to drift from the one the agent path uses. */
const HostDraftToolArgs = Schema.Unknown;
const HostDraftToolResult = Schema.Unknown;

function resultText(result: T3TeamToolCallResult): string {
  return result.content.map((entry) => entry.text).join("\n") || "The draft tool call failed.";
}

function hostDraftToolRef(id: string): ToolRef<unknown, unknown> {
  return defineTool({
    id,
    group: T3TEAM_WORKFLOW_DRAFT_TOOL_GROUP,
    args: HostDraftToolArgs,
    result: HostDraftToolResult,
    handler: async (args, ctx) => {
      const callHostTool = ctx.t3team?.callHostTool;
      if (callHostTool === undefined) {
        throw new Error(
          `Tool '${id}' needs a thread-bound host runtime. This run was started without one (a headless run has no thread to propose the draft on).`,
        );
      }
      return await callHostTool({ tool: id, args });
    },
  });
}

/** Registered ONCE at module load — `defineTool` refuses a duplicate id, and the engine executes a
 * tool by looking its id up in that global registry, so per-run refs would never be reached. The
 * per-run part is the `ctx.t3team` client the handlers read. */
export const T3TEAM_WORKFLOW_HOST_DRAFT_TOOL_REFS: ReadonlyArray<ToolRef<unknown, unknown>> =
  T3TEAM_WORKFLOW_HOST_DRAFT_TOOL_IDS.map(hostDraftToolRef);

/**
 * The per-run host bridge. `undefined` for a headless run: with no launch thread there is no
 * binding to reach and nowhere a proposal could be reviewed, so the refs stay bound but each call
 * reports exactly that instead of drafting into a void.
 *
 * `allowedToolGroups` is the LAUNCHING RECIPE's declared scope and must be forwarded: omitting it
 * leaves `buildBindingState` with `effectiveGroups === undefined`, which means "every tool the
 * thread offers" and silently ignores a recipe that scoped itself narrowly.
 */
export function makeT3TeamWorkflowHostDraftToolClient(input: {
  readonly broker: T3TeamToolBrokerShape;
  readonly launchThreadId: string | undefined;
  readonly allowedToolGroups?: ReadonlyArray<string> | undefined;
}): T3TeamToolHandlerClient | undefined {
  const { broker, launchThreadId, allowedToolGroups } = input;
  if (launchThreadId === undefined || launchThreadId.trim().length === 0) return undefined;

  return {
    // Not part of this seam's scope; the draft family is. Mirrors the SDK bridge's stub.
    renameThread: async () => {
      throw new Error("t3team.thread.rename is not reachable through workflow host tools.");
    },
    callHostTool: async ({ tool, args }) => {
      // Defence in depth: the tool tree already limits WHICH ids exist, and this keeps the
      // transport from widening if a future ref is registered against the same client.
      if (!HOST_DRAFT_TOOL_ID_SET.has(tool)) {
        throw new Error(`Tool '${tool}' is not exposed to workflow bodies.`);
      }
      const binding = await Effect.runPromise(
        broker.bindSession({
          threadId: ThreadId.make(launchThreadId),
          ...(allowedToolGroups === undefined ? {} : { allowedToolGroups }),
        }),
      );
      if (binding === undefined) {
        throw new Error(
          `No t3team tool binding is available on thread '${launchThreadId}', so '${tool}' cannot propose a draft.`,
        );
      }
      const result = await Effect.runPromise(
        binding.callTool({
          server: T3TEAM_MCP_SERVER_NAME,
          tool,
          arguments: args,
          threadId: launchThreadId,
        }),
      );
      // A broker error result is a FAILED step, not a value: surfacing it as data would let a body
      // report "draft proposed" when nothing is pending review.
      if (result.isError === true) throw new Error(resultText(result));
      return result.structuredContent;
    },
  };
}

/** The run-option fragment for a launch. The refs are bound even with NO client, so a body that
 * calls one on a headless run fails at the CALL with a sentence naming the cause instead of
 * `Cannot read properties of undefined` — the same reasoning as the SDK's `defaultBroker` stand-in
 * (`t3team-sdk.bodyTrees.ts`). The capability gate runs first either way, so binding a ref grants
 * nothing: without a client every call can only fail. */
export function t3teamWorkflowHostToolRunOptions(client: T3TeamToolHandlerClient | undefined): {
  readonly tools: ReadonlyArray<ToolRef<unknown, unknown>>;
  readonly t3team?: T3TeamToolHandlerClient;
} {
  return client === undefined
    ? { tools: T3TEAM_WORKFLOW_HOST_DRAFT_TOOL_REFS }
    : { tools: T3TEAM_WORKFLOW_HOST_DRAFT_TOOL_REFS, t3team: client };
}
