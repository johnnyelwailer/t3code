/**
 * Canonical broker tools exposed through provider-safe MCP names. The MCP toolkit
 * (`mcp/toolkits/t3team/tools.ts`) registers exactly these; its parity test requires every
 * implemented catalog tool to be mapped or named in the explicit policy-exclusion set.
 *
 * Kept free of imports so broker modules can name a tool the way an agent calls it — hints and
 * errors must say `t3_orchestration_status`, not the broker id the agent never sees.
 */
export const T3TEAM_MCP_CANONICAL_TOOL_MAP = {
  t3_provider_usage: "t3team.runtime.provider_usage",
  t3_search_thread: "t3team.thread.search",
  t3_search_source: "t3team.thread.search_source",
  t3_read_message: "t3team.thread.read_message",
  t3_ask_user: "t3team.thread.ask_user",
  t3_task_ops: "t3team.thread.children",
  t3_orchestration_run: "t3team.orchestration.run",
  t3_orchestration_status: "t3team.orchestration.status",
  t3_orchestration_resume: "t3team.orchestration.resume",
  t3_orchestration_pause: "t3team.orchestration.pause",
  t3_orchestration_stop: "t3team.orchestration.stop",
  t3_show_widget: "t3team.widget.show",
  t3_recipe_list: "t3team.recipe.list",
  t3_recipe_validate: "t3team.recipe.validate",
  t3_mywork_digest: "t3team.mywork.digest.read",
  t3_mywork_arrange: "t3team.mywork.arrange",
} as const;

const MCP_NAME_BY_TOOL_ID: ReadonlyMap<string, string> = new Map(
  Object.entries(T3TEAM_MCP_CANONICAL_TOOL_MAP).map(([mcpName, id]) => [id, mcpName]),
);

/** The name an agent calls `toolId` by; an id with no MCP tool is returned unchanged. */
export const mcpToolNameOf = (toolId: string): string => MCP_NAME_BY_TOOL_ID.get(toolId) ?? toolId;
