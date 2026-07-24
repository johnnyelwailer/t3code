/**
 * Deprecated canonical broker tool ids kept alive as aliases.
 *
 * The agent-orchestration tools were renamed `t3work.workflow.*` →
 * `t3work.orchestration.*`. Existing callers (pack drivers reaching `/mcp`,
 * widget `capabilities.tools` allowlists, agent prompts and transcripts) still
 * name the old ids, and a hard break would silently strip the orchestration
 * capability from every running agent. Resolution happens BEFORE the
 * availability/permission gate in {@link ./t3work-toolBrokerBindingDispatch.ts},
 * so the legacy names dispatch identically without appearing in any catalog
 * (no doubled tool list in the agent's context).
 *
 * Add nothing else here: this is a compat shim, not a naming layer.
 *
 * @module t3work-toolBrokerLegacyToolIds
 */
import { T3WORK_WORKFLOW_RESUME_TOOL_ID } from "./t3work-toolBrokerBindingWorkflowResume.ts";
import { T3WORK_WORKFLOW_RUN_TOOL_ID } from "./t3work-toolBrokerBindingWorkflowRun.ts";
import { T3WORK_WORKFLOW_STATUS_TOOL_ID } from "./t3work-toolBrokerBindingWorkflowStatus.ts";

/** Deprecated canonical id → current canonical id. */
export const T3WORK_LEGACY_CANONICAL_TOOL_IDS: Readonly<Record<string, string>> = {
  "t3work.workflow.run": T3WORK_WORKFLOW_RUN_TOOL_ID,
  "t3work.workflow.status": T3WORK_WORKFLOW_STATUS_TOOL_ID,
  "t3work.workflow.resume": T3WORK_WORKFLOW_RESUME_TOOL_ID,
};

/** Map a possibly-deprecated canonical tool id onto the current one. */
export const resolveT3workCanonicalToolId = (tool: string): string =>
  T3WORK_LEGACY_CANONICAL_TOOL_IDS[tool] ?? tool;
