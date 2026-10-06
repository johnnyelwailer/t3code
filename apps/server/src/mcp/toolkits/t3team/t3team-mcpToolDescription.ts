import {
  getT3TeamToolDefinition,
  type T3TeamImplementedToolId,
} from "@t3tools/project-context/t3teamToolCatalog";

import { T3TEAM_MCP_CANONICAL_TOOL_MAP } from "../../../t3team-mcpCanonicalToolMap.ts";

/**
 * The broker catalog's description for a canonical tool, with every canonical id the text names
 * rewritten to its MCP tool name (table-driven through the map, so it is exact).
 */
export function mcpDescriptionOf(canonicalId: T3TeamImplementedToolId): string {
  let text: string = getT3TeamToolDefinition(canonicalId).description;
  for (const [mcpName, id] of Object.entries(T3TEAM_MCP_CANONICAL_TOOL_MAP)) {
    text = text.replaceAll(id, mcpName);
  }
  return text;
}
