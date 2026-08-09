/**
 * Deprecated canonical broker tool ids kept alive as aliases.
 *
 * The agent-orchestration tools were renamed `t3team.workflow.*` →
 * `t3team.orchestration.*`. Existing callers (pack drivers reaching `/mcp`,
 * widget `capabilities.tools` allowlists, agent prompts and transcripts) still
 * name the old ids, and a hard break would silently strip the orchestration
 * capability from every running agent. Resolution happens BEFORE the
 * availability/permission gate in {@link ./t3team-toolBrokerBindingDispatch.ts},
 * so the legacy names dispatch identically without appearing in any catalog
 * (no doubled tool list in the agent's context).
 *
 * Add nothing else here: this is a compat shim, not a naming layer.
 *
 * @module t3team-toolBrokerLegacyToolIds
 */
import { T3TEAM_WORKFLOW_RESUME_TOOL_ID } from "./t3team-toolBrokerBindingWorkflowResume.ts";
import { T3TEAM_WORKFLOW_RUN_TOOL_ID } from "./t3team-toolBrokerBindingWorkflowRun.ts";
import { T3TEAM_WORKFLOW_STATUS_TOOL_ID } from "./t3team-toolBrokerBindingWorkflowStatus.ts";

/** Deprecated canonical id → current canonical id. */
export const T3TEAM_LEGACY_CANONICAL_TOOL_IDS: Readonly<Record<string, string>> = {
  // Main's pre-orchestration ids. Agents in flight are calling these RIGHT NOW,
  // so they must keep resolving.
  "t3team.workflow.run": T3TEAM_WORKFLOW_RUN_TOOL_ID,
  "t3team.workflow.status": T3TEAM_WORKFLOW_STATUS_TOOL_ID,
  "t3team.workflow.resume": T3TEAM_WORKFLOW_RESUME_TOOL_ID,
  // Pre-rebrand ids (t3work era). Kept because pack drivers and stored widget
  // tool allowlists may still carry them; the rebrand alone would have broken them.
  "t3work.workflow.run": T3TEAM_WORKFLOW_RUN_TOOL_ID,
  "t3work.workflow.status": T3TEAM_WORKFLOW_STATUS_TOOL_ID,
  "t3work.workflow.resume": T3TEAM_WORKFLOW_RESUME_TOOL_ID,
  "t3work.orchestration.run": T3TEAM_WORKFLOW_RUN_TOOL_ID,
  "t3work.orchestration.status": T3TEAM_WORKFLOW_STATUS_TOOL_ID,
  "t3work.orchestration.resume": T3TEAM_WORKFLOW_RESUME_TOOL_ID,
};

/** Map a possibly-deprecated canonical tool id onto the current one. */
export const resolveT3TeamCanonicalToolId = (tool: string): string =>
  T3TEAM_LEGACY_CANONICAL_TOOL_IDS[tool] ?? tool;
