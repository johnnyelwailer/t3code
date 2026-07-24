/**
 * Synchronous format precheck for an inline `t3work.orchestration.run` `source` submission. Live
 * incident: an agent submitted YAML instead of workflow TypeScript. The run was accepted, then
 * failed asynchronously — the agent never saw actionable feedback in the tool result, and no plan
 * card ever appeared (see {@link ./t3work-workflowShapePreview.ts}) because the shape could not be
 * derived. This precheck runs BEFORE the run is admitted/persisted, so a bad submission fails the
 * tool call synchronously and carries the full authoring manual for an immediate fix + resubmit.
 *
 * Cheap and static only: a substring check for the required `export const meta` entry contract,
 * plus a best-effort `deriveWorkflowShape` parse to catch unparseable TypeScript. Neither executes
 * the workflow body.
 *
 * @module t3work-workflowSourcePrecheck
 */

import { deriveWorkflowShape } from "@t3work/sdk";

import { T3WORK_WORKFLOW_MANUAL } from "./t3work-workflowManual.ts";

/** Synthetic path for the precheck-only parse — never written to disk. */
const PRECHECK_SYNTHETIC_PATH = "/precheck/workflow.ts";

function rejectionMessage(reason: string): string {
  return `Workflow source rejected before launch: ${reason}.\n\n${T3WORK_WORKFLOW_MANUAL}`;
}

/**
 * Returns null when `source` looks like a valid workflow module, else a human-readable error
 * (the specific reason, followed by the full authoring manual).
 */
export function precheckWorkflowSource(source: string): string | null {
  // Whitespace-tolerant: the loader finds `meta` via the TypeScript AST, so a
  // literal-substring check would reject valid sources with legal spacing.
  if (!/export\s+const\s+meta\b/.test(source)) {
    return rejectionMessage(
      "missing `export const meta` — the body must be workflow TypeScript, not YAML/JSON",
    );
  }
  try {
    deriveWorkflowShape({ absolutePath: PRECHECK_SYNTHETIC_PATH, sourceText: source });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return rejectionMessage(`unparseable workflow TypeScript — ${detail}`);
  }
  return null;
}
