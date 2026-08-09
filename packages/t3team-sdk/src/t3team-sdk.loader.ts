/** T3Team's adapter for the generic trusted TypeScript workflow loader. */

import {
  extractMeta as extractGenericMeta,
  prepareWorkflow,
  runWorkflowBody,
  type PreparedWorkflow,
  type WorkflowMeta,
  type WorkflowSource,
} from "@runbook/ts/loader";

import { deterministicGlobals, hostSource } from "@runbook/ts/globals";

/** T3Team keeps its existing public loader surface while supplying its deterministic globals. */
export function extractMeta(
  prepared: PreparedWorkflow,
  source: WorkflowSource,
  schema: unknown,
): WorkflowMeta {
  return extractGenericMeta(prepared, source, schema, {
    globals: deterministicGlobals(hostSource()),
  });
}

export { prepareWorkflow, runWorkflowBody };
export type { PreparedWorkflow, WorkflowMeta, WorkflowSource };
