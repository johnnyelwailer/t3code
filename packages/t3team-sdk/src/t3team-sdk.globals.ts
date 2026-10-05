import type { RegisteredWorkflowScriptsTree, RegisteredWorkflowToolsTree } from "./t3team-sdk.ts";

declare global {
  const tools: RegisteredWorkflowToolsTree;
  const scripts: RegisteredWorkflowScriptsTree;
}
