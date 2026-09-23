// Top-level body that commits a `checkpoint()` boundary AND invokes a sub-workflow: proves the
// guard refuses nothing at the top level — the run's checkpoint primitive still journals its
// boundary exactly as before when sub-workflow composition is present.
import type * as Child from "./t3team-sdk.subChild.workflow.ts";
import { Schema } from "effect";
import { checkpoint, defineWorkflow, getArgs, workflow } from "@t3team/sdk";

export const Inputs = Schema.Struct({ name: Schema.String });

export const Outputs = Schema.Struct({
  compactedThroughSeq: Schema.Number,
  greeting: Schema.String,
});

export const meta = {
  name: "fixtures.sub-checkpoint-top-level",
  description: "Commits a top-level checkpoint alongside a sub-workflow invocation.",
  inputs: Inputs,
  outputs: Outputs,
  // The child declares ["script"], which must be a subset of the parent's capabilities.
  capabilities: ["script"],
} as const;

export default async function run() {
  const input = getArgs();
  const record = await checkpoint({ state: { i: 42 } });

  const child = defineWorkflow<typeof Child>("./t3team-sdk.subChild.workflow.ts");
  const sub = await workflow(child, { name: input.name });

  return { compactedThroughSeq: record.compactedThroughSeq, greeting: sub.greeting };
}
