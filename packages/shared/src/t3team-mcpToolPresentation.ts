/**
 * Fork tools on the `t3-code` MCP server that join upstream's T3 tool inventory
 * (`t3McpToolPresentation.ts`), so cards, summaries, provider identity recovery and
 * `htmlRenderFromToolItem` treat them like upstream's own tools.
 *
 * `t3_show_widget` publishes through upstream's HTML render path, so its summary action is
 * `html-render`: a completed call's `htmlRender` reference shows inline exactly like an
 * `html_render` page, on every client and provider.
 */
import type { T3McpToolDefinition } from "./t3McpToolPresentation.ts";

export const T3TEAM_MCP_TOOLS: Readonly<Record<string, T3McpToolDefinition>> = {
  t3_show_widget: {
    displayName: "Show a widget",
    labels: ["Show", "Showing", "Showed", "a widget"],
    icon: "t3-code",
    summaryAction: "html-render",
  },
};
