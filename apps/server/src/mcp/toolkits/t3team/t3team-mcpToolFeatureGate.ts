/**
 * Feature flags that switch whole t3 MCP tools. A tool whose flag is off is dropped from
 * `tools/list`, so a new provider session never sees it, and its handler refuses a call with a
 * message naming the flag, so an agent holding an older list gets an answer instead of a hang.
 * Every flag here is live: it is read on each list and each call.
 */
import {
  findFeatureFlag,
  readFeatureFlag,
  type FeatureFlagKey,
  type ReadFeatureFlagEnv,
} from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import type { McpProtocol } from "effect/ai";

import { T3TeamMcpToolError } from "./t3team-mcpToolError.ts";

const MCP_TOOL_FEATURE_FLAGS: ReadonlyMap<string, FeatureFlagKey> = new Map([
  ["t3_provider_usage", "AGENTS_THREAD_TOOLS"],
  ["t3_search_thread", "AGENTS_THREAD_TOOLS"],
  ["t3_search_source", "AGENTS_THREAD_TOOLS"],
  ["t3_read_message", "AGENTS_THREAD_TOOLS"],
  ["t3_ask_user", "AGENTS_THREAD_TOOLS"],
  ["t3team_thread_skill_metadata", "AGENTS_THREAD_TOOLS"],
  ["t3_task_ops", "ORCHESTRATION_CHILD_THREADS"],
  ["t3_show_widget", "AGENTS_WIDGETS"],
  ["t3_change_request_publish", "AGENTS_CHANGE_REQUEST_PUBLISH"],
  ["t3_linked_repository_sync", "PROJECT_LINKED_REPOSITORIES"],
  ["t3_mywork_digest", "MYWORK_DIGEST"],
  ["t3_mywork_arrange", "MYWORK_DIGEST"],
  ["t3_orchestration_run", "AGENTS_ORCHESTRATION_TOOLS"],
  ["t3_orchestration_status", "AGENTS_ORCHESTRATION_TOOLS"],
  ["t3_orchestration_resume", "AGENTS_ORCHESTRATION_TOOLS"],
  ["t3_orchestration_pause", "AGENTS_ORCHESTRATION_TOOLS"],
  ["t3_orchestration_stop", "AGENTS_ORCHESTRATION_TOOLS"],
  ["t3_recipe_list", "ORCHESTRATION_RECIPES"],
  ["t3_recipe_validate", "ORCHESTRATION_RECIPES"],
  ["t3_work_item_draft", "WORKITEM_DETAIL_DRAFTS"],
  ["t3_work_item_change_set", "WORKITEM_DETAIL_DRAFTS"],
]);

/** The flag that switches `toolName`, if one does. */
function mcpToolFeatureFlag(toolName: string): FeatureFlagKey | undefined {
  return MCP_TOOL_FEATURE_FLAGS.get(toolName);
}

export function isMcpToolEnabled(toolName: string, readEnv?: ReadFeatureFlagEnv): boolean {
  const key = mcpToolFeatureFlag(toolName);
  return key === undefined || readFeatureFlag(key, readEnv);
}

function mcpToolDisabledMessage(toolName: string): string {
  const key = mcpToolFeatureFlag(toolName);
  const label = key === undefined ? undefined : findFeatureFlag(key)?.label;
  return `${toolName} is turned off on this host (Settings → Features → ${label ?? key}). Continue without it.`;
}

/** Wraps a tool handler so it refuses while the tool's flag is off. */
export const whenMcpToolEnabled =
  <P, A, E, R>(toolName: string, handle: (params: P) => Effect.Effect<A, E, R>) =>
  (params: P): Effect.Effect<A, E | T3TeamMcpToolError, R> =>
    Effect.suspend((): Effect.Effect<A, E | T3TeamMcpToolError, R> =>
      isMcpToolEnabled(toolName)
        ? handle(params)
        : Effect.fail(new T3TeamMcpToolError({ message: mcpToolDisabledMessage(toolName) })),
    );

interface ListedTool {
  readonly name: string;
}

interface ToolListingCore {
  readonly tools: {
    readonly list: (profile: unknown) => Effect.Effect<ReadonlyArray<ListedTool>>;
  };
}

/** `tools/list` without the tools whose flag is off; `tools/call` is untouched. */
export const withFeatureGatedToolList = <Version extends McpProtocol.ProtocolVersion>(
  adapter: McpProtocol.ProtocolAdapter<Version>,
  readEnv?: ReadFeatureFlagEnv,
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
            core.tools
              .list(profile)
              .pipe(
                Effect.map((tools) => tools.filter((tool) => isMcpToolEnabled(tool.name, readEnv))),
              ),
        },
      },
      lifecycle,
      target,
    ),
});
