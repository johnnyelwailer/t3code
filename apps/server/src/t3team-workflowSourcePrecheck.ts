/**
 * Synchronous format precheck for a `t3team.orchestration.run` source submission (inline `source`
 * or an authorized `workflowPath` file). Live incident: an agent authored its workflow with an
 * unescaped backtick inside a template literal. The run was "accepted", then failed
 * asynchronously at body execution with a bare `SyntaxError: Invalid or unexpected token` — the
 * author saw no actionable feedback in the tool result, and no plan card ever appeared. This
 * precheck runs BEFORE the run is admitted/persisted, so a bad submission fails the tool call
 * synchronously and carries the full authoring manual for an immediate fix + resubmit.
 *
 * The gates are static, in execution order of the real load path:
 *  1. a substring-tolerant `export const meta` probe (the cheap, specific YAML/JSON catch);
 *  2. `prepareWorkflow` — the loader's own structural parse (missing meta statement, a default
 *     export the engine cannot call); it throws `WorkflowLoadError` with an actionable message;
 *  3. a `vm.Script` COMPILE of the transpiled meta + body scripts. `ts.transpileModule` and
 *     `ts.createSourceFile` both recover from syntax errors without throwing — only V8's
 *     compile step rejects them, which is exactly where the engine later dies (`runInContext`
 *     throws `SyntaxError`). Compiling the identical script text WITHOUT executing it is the
 *     precise static replica of that runtime failure: same compiler, same code, zero execution.
 * Neither gate ever runs the workflow body.
 *
 * @module t3team-workflowSourcePrecheck
 */

import * as NodeVM from "node:vm";

import { deriveWorkflowShape, prepareWorkflow } from "@t3team/sdk";

import { T3TEAM_WORKFLOW_MANUAL } from "./t3team-workflowManual.ts";

/** Synthetic path for the precheck-only parse — never written to disk. */
const PRECHECK_SYNTHETIC_PATH = "/precheck/workflow.ts";

function rejectionMessage(reason: string): string {
  return `Workflow source rejected before launch: ${reason}.\n\n${T3TEAM_WORKFLOW_MANUAL}`;
}

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  let prepared;
  try {
    prepared = prepareWorkflow({ absolutePath: PRECHECK_SYNTHETIC_PATH, sourceText: source });
  } catch (error) {
    return rejectionMessage(`invalid workflow structure — ${detail(error)}`);
  }
  try {
    // Compile-only: `vm.Script` runs V8's parser over the exact script the engine will
    // `runInContext` later, so a body-level syntax error is rejected HERE, synchronously,
    // with V8's own message — not after admission, at rehydration. Construction is the
    // compile step; nothing is ever run.
    const metaCheck = new NodeVM.Script(prepared.metaScript, { filename: PRECHECK_SYNTHETIC_PATH });
    const bodyCheck = new NodeVM.Script(prepared.bodyScript, { filename: PRECHECK_SYNTHETIC_PATH });
    void metaCheck;
    void bodyCheck;
  } catch (error) {
    return rejectionMessage(`unparseable workflow TypeScript — ${detail(error)}`);
  }
  try {
    // Best-effort shape parse (the same one that feeds the pre-launch plan card): it evaluates
    // the meta head with deterministic globals and rejects a `meta` that is not a usable object.
    deriveWorkflowShape({ absolutePath: PRECHECK_SYNTHETIC_PATH, sourceText: source });
  } catch (error) {
    return rejectionMessage(`invalid \`meta\` block — ${detail(error)}`);
  }
  return null;
}
