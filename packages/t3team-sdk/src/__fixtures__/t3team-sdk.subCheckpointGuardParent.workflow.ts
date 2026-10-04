// Invokes a sub-workflow that attempts `checkpoint()`. The guard refuses it: the run fails with
// SubWorkflowCheckpointError before any checkpoint boundary is journaled.
import type * as Child from "./t3team-sdk.subCheckpointChild.workflow.ts";
import { Schema } from "effect";
import { defineWorkflow, workflow } from "@t3team/sdk";

export const Outputs = Schema.Struct({ ok: Schema.Boolean });

export const meta = {
  name: "fixtures.sub-checkpoint-guard-parent",
  description: "Invokes a sub-workflow that attempts checkpoint().",
  outputs: Outputs,
} as const;

export default async function run() {
  const child = defineWorkflow<typeof Child>("./t3team-sdk.subCheckpointChild.workflow.ts");
  const out = await workflow(child, {});
  return out;
}
