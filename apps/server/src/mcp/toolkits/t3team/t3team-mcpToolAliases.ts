/**
 * The agent-facing MCP names of the t3team toolkit were unified on the `t3_` prefix. Every
 * former `t3team_*` name stays registered as a deprecated alias that forwards to the same
 * handler: shipped distributions, V1-imported history replays and existing recipes/workflows
 * still call the old names. Pure constants — imported by the toolkit, the author-approval gate
 * and tests, so it must not pull in the toolkit itself.
 */

/** Deprecated MCP name → current MCP name. Kept for one release cycle, then removed. */
export const T3TEAM_DEPRECATED_MCP_TOOL_ALIASES = {
  t3team_provider_usage: "t3_provider_usage",
  t3team_search_thread: "t3_search_thread",
  t3team_search_source: "t3_search_source",
  t3team_read_message: "t3_read_message",
  t3team_ask_user: "t3_ask_user",
  t3team_children: "t3_task_ops",
  t3team_orchestration_run: "t3_orchestration_run",
  t3team_orchestration_status: "t3_orchestration_status",
  t3team_orchestration_resume: "t3_orchestration_resume",
  t3team_orchestration_pause: "t3_orchestration_pause",
  t3team_orchestration_stop: "t3_orchestration_stop",
  t3team_show_widget: "t3_show_widget",
  t3team_recipe_list: "t3_recipe_list",
  t3team_recipe_validate: "t3_recipe_validate",
} as const;

/** The description every deprecated alias carries (the schema is the replacement's). */
export const deprecatedMcpAliasDescription = (replacement: string): string =>
  `Deprecated — use ${replacement}; this alias is kept for one release cycle and will be removed. ` +
  `Same parameters and behavior as ${replacement}.`;
