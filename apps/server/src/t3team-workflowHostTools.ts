/**
 * The broker-owned tools a workflow body may call from its `getTools()` tree.
 *
 * `defineTool` refs live in the SDK registry while the t3team capability surface is dispatched by
 * string id through {@link ./t3team-toolBrokerBinding.ts}; this module is the seam between them,
 * deliberately narrow — an explicit table, never the whole broker surface. Two families:
 *
 *   • the work-item DRAFT tools (`mutation.draft`): they write nothing; each builds a proposal a
 *     human accepts in the review UI;
 *   • `t3team.change_request.publish` (`mutation.change_request`): it DOES write — a commit, a
 *     push and a change request on the repository's host — so it has its own group, and a body
 *     reaches it only when both the body and its recipe name that group.
 *
 * WHICH THREAD THE PROPOSAL LANDS ON: the client binds the LAUNCH thread per call, and a
 * thread-bound binding carries `publishDraft` pinned to that same thread id (`t3team-toolBrokerLive.ts`
 * → `makeT3TeamDraftMutationPublisher({ threadId, … })`), so the `draft-mutation` thread artifact
 * lands on the thread the user launched from — the one whose review surface shows its drafts. The
 * same binding gives the publish tool that thread's checkout.
 * Binding per call (not once at launch) also reads the thread's CURRENT tool context, like an agent
 * turn does, and re-applies the recipe's `allowedToolGroups` every time.
 *
 * Three gates apply, all pre-existing: the body must declare the group in `meta.capabilities`
 * (`assertToolGroupDeclared`), the id must be in the thread's tool context (`availableToolIdSet`),
 * and the recipe's `allowedToolGroups` filters what survives.
 *
 * @module t3team-workflowHostTools
 */

import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  defineTool,
  defineToolGroup,
  type T3TeamToolHandlerClient,
  type ToolRef,
} from "@t3team/sdk";

import {
  T3TEAM_MCP_SERVER_NAME,
  type T3TeamToolBrokerShape,
  type T3TeamToolCallResult,
} from "./t3team-toolBroker.ts";

/**
 * Reuses the id of the broker-side draft classification (`PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP`)
 * so bodies, the permission UI and the audit log speak ONE vocabulary.
 */
const T3TEAM_WORKFLOW_DRAFT_TOOL_GROUP = defineToolGroup({
  id: "mutation.draft",
  label: "Propose work-item drafts",
  description:
    "Prepare reviewable work-item drafts (description, comment, assignee, estimate, status, subtask, links). A human accepts the draft before anything is written to the tracker.",
});

/** Same id as `PROJECT_RECIPE_MUTATION_CHANGE_REQUEST_TOOL_GROUP`. */
const T3TEAM_WORKFLOW_CHANGE_REQUEST_TOOL_GROUP = defineToolGroup({
  id: "mutation.change_request",
  label: "Publish change requests",
  description:
    "Commit the listed files, push a branch, and open a pull or merge request on the repository's host. This writes immediately; there is no review step.",
});

const T3TEAM_WORKFLOW_HOST_DRAFT_TOOL_IDS = [
  "t3team.work_item.description.draft_update",
  "t3team.work_item.comment.draft_create",
  "t3team.work_item.assignee.draft_update",
  "t3team.work_item.estimate.draft_update",
  "t3team.work_item.status.draft_update",
  "t3team.work_item.subtask.draft_create",
  "t3team.work_item.link.draft_create",
  "t3team.work_item.link.draft_remove",
] as const;

/** The exact broker tools reachable from a workflow body, each with the group a body must declare
 * to call it. Nothing outside this table is reachable. */
const T3TEAM_WORKFLOW_HOST_TOOLS = [
  ...T3TEAM_WORKFLOW_HOST_DRAFT_TOOL_IDS.map((id) => ({
    id,
    group: T3TEAM_WORKFLOW_DRAFT_TOOL_GROUP,
  })),
  { id: "t3team.change_request.publish", group: T3TEAM_WORKFLOW_CHANGE_REQUEST_TOOL_GROUP },
];

const HOST_TOOL_ID_SET: ReadonlySet<string> = new Set(T3TEAM_WORKFLOW_HOST_TOOLS.map((t) => t.id));

/** Permissive on purpose: the broker already validates each tool's arguments and answers a bad
 * call specifically (`… requires issue_id.`). Restating those shapes here would be a second copy
 * of that contract, free to drift from the one the agent path uses. */
const HostToolArgs = Schema.Unknown;
const HostToolResult = Schema.Unknown;

function resultText(result: T3TeamToolCallResult): string {
  return result.content.map((entry) => entry.text).join("\n") || "The host tool call failed.";
}

function hostToolRef(tool: (typeof T3TEAM_WORKFLOW_HOST_TOOLS)[number]): ToolRef<unknown, unknown> {
  const { id, group } = tool;
  return defineTool({
    id,
    group,
    args: HostToolArgs,
    result: HostToolResult,
    handler: async (args, ctx) => {
      const callHostTool = ctx.t3team?.callHostTool;
      if (callHostTool === undefined) {
        throw new Error(
          `Tool '${id}' needs a thread-bound host runtime. This run was started without one (a headless run has no thread to act on).`,
        );
      }
      return await callHostTool({ tool: id, args });
    },
  });
}

/** Registered ONCE at module load — `defineTool` refuses a duplicate id, and the engine executes a
 * tool by looking its id up in that global registry, so per-run refs would never be reached. The
 * per-run part is the `ctx.t3team` client the handlers read. */
const T3TEAM_WORKFLOW_HOST_TOOL_REFS: ReadonlyArray<ToolRef<unknown, unknown>> =
  T3TEAM_WORKFLOW_HOST_TOOLS.map(hostToolRef);

/**
 * The per-run host bridge. `undefined` for a headless run: with no launch thread there is no
 * binding to reach, no checkout to publish from and nowhere a proposal could be reviewed, so the
 * refs stay bound but each call reports exactly that instead of acting into a void.
 *
 * `allowedToolGroups` is the LAUNCHING RECIPE's declared scope and must be forwarded: omitting it
 * leaves `buildBindingState` with `effectiveGroups === undefined`, which means "every tool the
 * thread offers" and silently ignores a recipe that scoped itself narrowly.
 */
export function makeT3TeamWorkflowHostToolClient(input: {
  readonly broker: T3TeamToolBrokerShape;
  readonly launchThreadId: string | undefined;
  readonly allowedToolGroups?: ReadonlyArray<string> | undefined;
}): T3TeamToolHandlerClient | undefined {
  const { broker, launchThreadId, allowedToolGroups } = input;
  if (launchThreadId === undefined || launchThreadId.trim().length === 0) return undefined;

  return {
    callHostTool: async ({ tool, args }) => {
      // Defence in depth: the tool tree already limits WHICH ids exist, and this keeps the
      // transport from widening if a future ref is registered against the same client.
      if (!HOST_TOOL_ID_SET.has(tool)) {
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
          `No t3team tool binding is available on thread '${launchThreadId}', so '${tool}' cannot run.`,
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
      // report "draft proposed" or "published" when nothing happened.
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
    ? { tools: T3TEAM_WORKFLOW_HOST_TOOL_REFS }
    : { tools: T3TEAM_WORKFLOW_HOST_TOOL_REFS, t3team: client };
}
