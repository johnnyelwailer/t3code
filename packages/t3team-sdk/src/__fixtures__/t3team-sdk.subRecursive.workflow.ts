// Calls ITSELF as a sub-workflow. Refused by the host's cycle guard, by name, before the second
// invocation runs — see `SubWorkflowStack` in t3team-sdk.bodyRunner.ts.
//
// Recursion is refused rather than bounded because a recursive body cannot replay: each iteration
// writes journal entries at a `seq` that depends on how many iterations preceded it, so a resume
// that re-enters with different data drifts. A loop in the caller's own body has none of that
// problem, and covers every case this shape would.
import { Schema } from "effect";
import { defineWorkflow, workflow } from "@t3team/sdk";

import type * as Self from "./t3team-sdk.subRecursive.workflow.ts";

export const Outputs = Schema.Struct({ depth: Schema.Number });

export const meta = {
  name: "fixtures.sub-recursive",
  description: "Invokes itself as a sub-workflow; the host must refuse the cycle.",
  outputs: Outputs,
  capabilities: [],
} as const;

export default async function run() {
  const self = defineWorkflow<typeof Self>("./t3team-sdk.subRecursive.workflow.ts");
  const inner = await workflow(self, {});
  return { depth: inner.depth + 1 };
}
