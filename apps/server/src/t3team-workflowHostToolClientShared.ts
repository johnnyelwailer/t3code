/**
 * Generic per-run host-tool bridge shared by every broker-tool FAMILY bridged into a workflow
 * body's `getTools()` tree (currently: work-item drafts in `t3team-workflowHostDraftTools.ts` and
 * thread handoff in `t3team-workflowHostHandoffTools.ts`).
 *
 * Extracted out of the draft module once a second family (`thread.handoff`) needed the exact same
 * shape — bind the LAUNCH thread per call so `allowedToolGroups` and tool context are re-read live,
 * reject any id outside an explicit whitelist, and turn a broker error result into a thrown error
 * so a body can never report success when nothing actually happened. Duplicating that per family
 * would let two copies drift (e.g. one forgetting to forward `allowedToolGroups`); one shared
 * builder, parameterized by the family's own id whitelist, cannot drift that way.
 *
 * This module knows nothing about which ids exist in which family — that classification stays in
 * each family's own file, which is also where the `defineTool` refs are registered.
 *
 * @module t3team-workflowHostToolClientShared
 */

import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  defineTool,
  type T3TeamToolHandlerClient,
  type ToolGroupRef,
  type ToolRef,
} from "@t3team/sdk";
import * as Schema from "effect/Schema";

import {
  T3TEAM_MCP_SERVER_NAME,
  type T3TeamToolBrokerShape,
  type T3TeamToolCallResult,
} from "./t3team-toolBroker.ts";

/** Permissive on purpose: the broker already validates each bridged tool's arguments and answers a
 * bad call specifically. Restating those shapes here would be a second copy of that contract, free
 * to drift from the one the agent path uses. */
const HostToolArgs = Schema.Unknown;
const HostToolResult = Schema.Unknown;

export function hostToolResultText(result: T3TeamToolCallResult): string {
  return result.content.map((entry) => entry.text).join("\n") || "The host tool call failed.";
}

/** Builds one `defineTool` ref that forwards to `ctx.t3team.callHostTool`. Shared by every family
 * so a headless run (no thread-bound client) fails every bridged tool with the same sentence,
 * regardless of family. */
export function hostBridgedToolRef(input: {
  readonly id: string;
  readonly group: ToolGroupRef;
}): ToolRef<unknown, unknown> {
  const { id, group } = input;
  return defineTool({
    id,
    group,
    args: HostToolArgs,
    result: HostToolResult,
    handler: async (args, ctx) => {
      const callHostTool = ctx.t3team?.callHostTool;
      if (callHostTool === undefined) {
        throw new Error(
          `Tool '${id}' needs a thread-bound host runtime. This run was started without one (a headless run has no thread to call '${id}' on).`,
        );
      }
      return await callHostTool({ tool: id, args });
    },
  });
}

/**
 * The per-run host bridge, generic over WHICH ids it admits. `undefined` for a headless run: with
 * no launch thread there is no binding to reach, so the refs stay bound but each call reports
 * exactly that instead of acting into a void.
 *
 * `allowedToolGroups` is the LAUNCHING RECIPE's declared scope and must be forwarded: omitting it
 * leaves `buildBindingState` with `effectiveGroups === undefined`, which means "every tool the
 * thread offers" and silently ignores a recipe that scoped itself narrowly.
 */
export function makeT3TeamWorkflowHostToolClient(input: {
  readonly broker: T3TeamToolBrokerShape;
  readonly launchThreadId: string | undefined;
  readonly allowedToolGroups?: ReadonlyArray<string> | undefined;
  readonly allowedToolIds: ReadonlySet<string>;
}): T3TeamToolHandlerClient | undefined {
  const { broker, launchThreadId, allowedToolGroups, allowedToolIds } = input;
  if (launchThreadId === undefined || launchThreadId.trim().length === 0) return undefined;

  return {
    // Not part of this bridge's scope. Mirrors the SDK bridge's stub.
    renameThread: async () => {
      throw new Error("t3team.thread.rename is not reachable through workflow host tools.");
    },
    callHostTool: async ({ tool, args }) => {
      // Defence in depth: the tool tree already limits WHICH ids exist, and this keeps the
      // transport from widening if a future ref is registered against the same client.
      if (!allowedToolIds.has(tool)) {
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
      // report success when nothing actually happened.
      if (result.isError === true) throw new Error(hostToolResultText(result));
      return result.structuredContent;
    },
  };
}

/** The run-option fragment for a launch, combining every family's refs. The refs are bound even
 * with NO client, so a body that calls one on a headless run fails at the CALL with a sentence
 * naming the cause instead of `Cannot read properties of undefined` — the same reasoning as the
 * SDK's `defaultBroker` stand-in (`t3team-sdk.bodyTrees.ts`). The capability gate runs first either
 * way, so binding a ref grants nothing: without a client every call can only fail. */
export function combinedHostToolRunOptions(
  client: T3TeamToolHandlerClient | undefined,
  refFamilies: ReadonlyArray<ReadonlyArray<ToolRef<unknown, unknown>>>,
): {
  readonly tools: ReadonlyArray<ToolRef<unknown, unknown>>;
  readonly t3team?: T3TeamToolHandlerClient;
} {
  const tools = refFamilies.flat();
  return client === undefined ? { tools } : { tools, t3team: client };
}
