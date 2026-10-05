// Invokes a sub-workflow that attempts `watermark()`. The guard refuses it: the run fails with
// SubWorkflowCheckpointError before any checkpoint boundary is journaled.
import type * as Child from "./t3team-sdk.subWatermarkChild.workflow.ts";
import { Schema } from "effect";
import { defineWorkflow, workflow } from "@t3team/sdk";

export const Outputs = Schema.Struct({ ok: Schema.Boolean });

export const meta = {
  name: "fixtures.sub-watermark-guard-parent",
  description: "Invokes a sub-workflow that attempts watermark().",
  outputs: Outputs,
  capabilities: ["source:work-item.updates"],
} as const;

export default async function run() {
  const child = defineWorkflow<typeof Child>("./t3team-sdk.subWatermarkChild.workflow.ts");
  return await workflow(child, {});
}
