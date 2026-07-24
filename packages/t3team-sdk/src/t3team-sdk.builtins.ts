import { buildToolTree, type ToolTreeFromRefs } from "./t3team-sdk.ts";
import { renameThreadTool } from "./tools/t3team-sdk.t3team.ts";

export const BUILTIN_TOOL_REFS = [renameThreadTool] as const;
export type BuiltinToolsTree = ToolTreeFromRefs<typeof BUILTIN_TOOL_REFS>;

export const builtinTools = buildToolTree(BUILTIN_TOOL_REFS);
