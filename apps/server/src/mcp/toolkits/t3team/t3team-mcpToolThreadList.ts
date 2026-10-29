/**
 * `tools/list` for one calling thread. The list is otherwise the same for every credential, but an
 * opt-in tool (`defaultEnabled: false` in the catalog, today `t3_change_request_publish`) is only
 * callable on a thread that was given it, so advertising it everywhere sends an agent into a call
 * the broker refuses. This wrapper drops an opt-in tool from the list unless the caller's own
 * binding holds it, which is the same check the call makes.
 *
 * Fails open (list unchanged) only when the broker is not reachable from the list handler, because
 * then enablement cannot be evaluated; a credential with no thread, or a thread with no binding,
 * cannot call the tool and does not see it.
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { McpProtocol } from "effect/ai";

import { T3TEAM_MCP_CANONICAL_TOOL_MAP } from "../../../t3team-mcpCanonicalToolMap.ts";
import { listOptInThreadTools } from "../../../t3team-threadOptInTools.ts";
import { T3TeamToolBroker } from "../../../t3team-toolBroker.ts";
import { WORK_ITEM_READ_TOOL_IDS } from "../../../t3team-workItemReadAvailability.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

interface ListedTool {
  readonly name: string;
}

interface ToolListingCore {
  readonly tools: {
    readonly list: (profile: unknown) => Effect.Effect<ReadonlyArray<ListedTool>>;
  };
}

/**
 * The MCP tool name → catalog tool id of every tool the MCP surface lists only when the caller's
 * binding holds it: the opt-in tools, and the work-item read tools (held only while Jira is
 * connected for the thread's project, `t3team-workItemReadAvailability.ts`).
 */
function optInMcpTools(): ReadonlyMap<string, string> {
  const optIn = new Set([
    ...listOptInThreadTools().map((tool) => tool.toolId),
    ...WORK_ITEM_READ_TOOL_IDS,
  ]);
  return new Map(
    Object.entries(T3TEAM_MCP_CANONICAL_TOOL_MAP).filter(([, toolId]) => optIn.has(toolId)),
  );
}

/** `tools` without the gated tools the calling thread cannot call. */
const filterToolsForCaller = Effect.fn("filterToolsForCaller")(function* <T extends ListedTool>(
  tools: ReadonlyArray<T>,
) {
  const optIn = optInMcpTools();
  if (!tools.some((tool) => optIn.has(tool.name))) return tools;
  const broker = yield* Effect.serviceOption(T3TeamToolBroker);
  if (Option.isNone(broker)) return tools;
  const invocation = yield* Effect.serviceOption(McpInvocationContext.McpInvocationContext);
  const threadId = Option.getOrUndefined(invocation)?.thread?.threadId;
  const binding =
    threadId === undefined ? undefined : yield* broker.value.bindSession({ threadId });
  const held = new Set(
    (binding?.listServers() ?? []).flatMap((server) => Object.keys(server.tools)),
  );
  return tools.filter((tool) => {
    const toolId = optIn.get(tool.name);
    return toolId === undefined || held.has(toolId);
  });
});

export const withThreadScopedToolList = <Version extends McpProtocol.ProtocolVersion>(
  adapter: McpProtocol.ProtocolAdapter<Version>,
): McpProtocol.ProtocolAdapter<Version> => ({
  ...adapter,
  installHandlers: (core: ToolListingCore, lifecycle: unknown, target: unknown) =>
    // @effect-diagnostics-next-line anyUnknownInErrorContext:off - the adapter erases its handler requirements to unknown; this wrapper adds none.
    adapter.installHandlers(
      {
        ...core,
        tools: {
          ...core.tools,
          list: (profile: unknown) =>
            core.tools.list(profile).pipe(Effect.flatMap((tools) => filterToolsForCaller(tools))),
        },
      },
      lifecycle,
      target,
    ),
});
