import { MCP_APP_RESOURCE_SCHEME } from "@t3tools/shared/mcpApp";
import * as Predicate from "effect/Predicate";

/**
 * The `ui://` resource a tool's `_meta` declares as its MCP app (`_meta.ui.resourceUri`, or the
 * legacy flat `ui/resourceUri`). Upstream dropped this helper from `@t3tools/shared/mcpApp`; pack
 * drivers capture apps from tool metadata, so the fork keeps it here.
 */
export function readMcpAppResourceUri(meta: unknown): string | undefined {
  if (!Predicate.isObject(meta)) return undefined;
  const nested = Predicate.isObject(meta.ui) ? meta.ui.resourceUri : undefined;
  const uri = nested ?? meta["ui/resourceUri"];
  return typeof uri === "string" && uri.startsWith(MCP_APP_RESOURCE_SCHEME) ? uri : undefined;
}
