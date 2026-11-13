import {
  getT3TeamToolDefinition,
  type T3TeamImplementedToolId,
} from "@t3tools/project-context/t3teamToolCatalog";

import { T3TEAM_MCP_CANONICAL_TOOL_MAP } from "../../../t3team-mcpCanonicalToolMap.ts";

/** Every canonical id the text names, rewritten to its MCP tool name (table-driven, so exact). */
function withMcpToolNames(text: string): string {
  let rewritten = text;
  for (const [mcpName, id] of Object.entries(T3TEAM_MCP_CANONICAL_TOOL_MAP)) {
    rewritten = rewritten.replaceAll(id, mcpName);
  }
  return rewritten;
}

/** The broker catalog's description for a canonical tool, in MCP tool names. */
export function mcpDescriptionOf(canonicalId: T3TeamImplementedToolId): string {
  return withMcpToolNames(getT3TeamToolDefinition(canonicalId).description);
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

/** The catalog's description of one input property, in MCP tool names ("" when it has none). */
export function mcpPropertyDescriptionOf(
  canonicalId: T3TeamImplementedToolId,
  property: string,
): string {
  const schema: unknown = getT3TeamToolDefinition(canonicalId).inputSchema;
  const entry = isRecord(schema) && isRecord(schema.properties) ? schema.properties[property] : {};
  const description = isRecord(entry) ? entry.description : undefined;
  return typeof description === "string" ? withMcpToolNames(description) : "";
}
