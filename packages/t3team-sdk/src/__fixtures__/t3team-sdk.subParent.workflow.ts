// Sub-workflow parent: constructs a typed child ref via `defineWorkflow` and runs it inline
// with `workflow(child, args)`. The call is ONE journal entry (kind "workflow"); on resume
// the recorded sub-result replays and the child body does not re-execute.
import type * as Child from "./t3team-sdk.subChild.workflow.ts";
import { Schema } from "effect";
import { defineWorkflow, getArgs, workflow } from "@t3team/sdk";

export const Inputs = Schema.Struct({ name: Schema.String });

export const Outputs = Schema.Struct({
  greeting: Schema.String,
  upper: Schema.String,
});

export const meta = {
  name: "fixtures.sub-parent",
  description: "Runs the sub-child workflow inline and upper-cases its greeting.",
  inputs: Inputs,
  outputs: Outputs,
  // The child declares ["script"]; a nested workflow may declare a subset of the parent's
  // capabilities but never a superset, so the parent must hold "script" too.
  capabilities: ["script"],
} as const;

export default async function run() {
  const args = getArgs();

  const input = Schema.decodeSync(Inputs)(args);

  const child = defineWorkflow<typeof Child>("./t3team-sdk.subChild.workflow.ts");
  const sub = await workflow(child, { name: input.name });

  return { greeting: sub.greeting, upper: sub.greeting.toUpperCase() };
}
