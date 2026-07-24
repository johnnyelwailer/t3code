import type { BuiltinToolsTree } from "./t3team-sdk.builtins.ts";
import type { RegisteredWorkflowScriptsTree, RegisteredWorkflowToolsTree } from "./t3team-sdk.ts";

declare global {
  const tools: BuiltinToolsTree & RegisteredWorkflowToolsTree;
  const scripts: RegisteredWorkflowScriptsTree;
}
