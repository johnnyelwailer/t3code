// Parent body for the caller-path regression fixture: resolves a RELATIVE sub-workflow path from
// inside the runbook-ts VM. Regression guard for eb59059498 — the VM body frame's filename
// carries the `(runbook-ts) ` resource-name label, and if that label leaks into
// `findCallerFilePath`, this relative path resolves against a path that does not exist and the
// run fails before the child ever starts.
import { Schema } from "effect";
import { defineWorkflow, workflow } from "@t3team/sdk";

import type * as Child from "./t3team-sdk.callerPathChild.workflow.ts";

export const Outputs = Schema.Struct({ marker: Schema.String });

export const meta = {
  name: "fixtures.caller-path-parent",
  description: "Resolves a relative sub-workflow path from inside the VM body.",
  outputs: Outputs,
  capabilities: [],
} as const;

export default async function run() {
  const child = defineWorkflow<typeof Child>("./t3team-sdk.callerPathChild.workflow.ts");
  const { marker } = await workflow(child, {});
  return { marker };
}
