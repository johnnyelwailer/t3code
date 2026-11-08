/**
 * MCP Apps (`io.modelcontextprotocol/ui`) for MCP servers a pack provider connects itself.
 *
 * The host renders an app inline exactly as it does for a built-in adapter; the protocol
 * vocabulary stays host-owned:
 * - the session's {@link PackMcpAppsHost} supplies the client capabilities a pack merges into
 *   each MCP `initialize`, and decides which listed tools the model may see;
 * - a `dynamic_tool` item that ran such a tool names it `<server>.<tool>`, carries the call's own
 *   arguments as `input`, and puts {@link PackMcpToolCallOutput} in `output`. The host resolves
 *   the tool's `_meta.ui.resourceUri`, stores the app document and replaces the output with its
 *   app reference beside the result, or with `text` when the call opens no app;
 * - {@link PackMcpApps} on the session answers the app view's own requests.
 *
 * @module mcp-apps
 */
import type { PackJson } from "./provider-orchestration.ts";

/** One MCP `tools/list` entry, verbatim (`_meta` and `annotations` included). */
export type PackMcpTool = PackJson & { readonly name: string };

/** One MCP `tools/call` result, verbatim. */
export type PackMcpCallToolResult = PackJson & { readonly content: readonly unknown[] };

/** Host `ProviderAdapterV2McpApps`, keyed by the provider thread that showed the app. */
export type PackMcpApps = {
  listTools(input: {
    readonly providerThreadId: string;
    readonly server: string;
  }): Promise<readonly PackMcpTool[]>;
  callTool(input: {
    readonly providerThreadId: string;
    readonly server: string;
    readonly tool: string;
    readonly arguments: Record<string, unknown>;
  }): Promise<PackMcpCallToolResult>;
  readResource(input: {
    readonly providerThreadId: string;
    readonly server: string;
    readonly uri: string;
  }): Promise<{ readonly contents: readonly unknown[] }>;
};

/** MCP Apps support the host offers one session (`PackSessionHost.mcpApps`). */
export type PackMcpAppsHost = {
  /** Merge into the `capabilities` of every MCP `initialize`, so servers offer their apps. */
  readonly clientCapabilities: PackJson;
  /** Whether the model may be offered a listed tool, judged from its `_meta`. */
  readonly toolVisibleToModel: (meta: unknown) => boolean;
};

export const PACK_MCP_TOOL_CALL_OUTPUT_KEY = "packMcpToolCall";

export type PackMcpToolCall = {
  readonly server: string;
  readonly tool: string;
  /** The tool's `_meta` from `tools/list`. */
  readonly toolMeta?: unknown;
  readonly result: PackMcpCallToolResult;
};

export type PackMcpToolCallOutput = {
  readonly [PACK_MCP_TOOL_CALL_OUTPUT_KEY]: PackMcpToolCall;
  /** The item's output when the call opens no app. */
  readonly text?: string;
};
