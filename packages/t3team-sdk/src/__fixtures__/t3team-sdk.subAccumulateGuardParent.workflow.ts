// Invokes a sub-workflow that attempts `accumulate()`. The guard refuses it: the run fails with
// SubWorkflowCheckpointError before any checkpoint boundary is journaled.
import type * as Child from "./t3team-sdk.subAccumulateChild.workflow.ts";
import { Schema } from "effect";
import { defineWorkflow, workflow } from "@t3team/sdk";

export const Outputs = Schema.Struct({ total: Schema.Number });

export const meta = {
  name: "fixtures.sub-accumulate-guard-parent",
  description: "Invokes a sub-workflow that attempts accumulate().",
  outputs: Outputs,
} as const;

export default async function run() {
  const child = defineWorkflow<typeof Child>("./t3team-sdk.subAccumulateChild.workflow.ts");
  return await workflow(child, {});
}
