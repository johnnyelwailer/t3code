import { Schema } from "effect";
import { defineWorkflow, getArgs, workflow } from "@t3team/sdk";

import type * as Child from "./t3team-sdk.subAskUserChild.workflow.ts";

export const Inputs = Schema.Struct({ subject: Schema.String });
export const Outputs = Schema.Struct({ answer: Schema.String });

export const meta = {
  name: "fixtures.sub-ask-user-parent",
  description: "Middle level: runs the escalating child as its own sub-workflow.",
  inputs: Inputs,
  outputs: Outputs,
  // Must hold "user" itself: a child may declare a SUBSET of its caller's capabilities, never a
  // superset, and that check runs against the immediate caller rather than the root.
  capabilities: ["user"],
} as const;

export default async function run() {
  const input = Schema.decodeSync(Inputs)(getArgs());
  const child = defineWorkflow<typeof Child>("./t3team-sdk.subAskUserChild.workflow.ts");
  const result = await workflow(child, { subject: input.subject });
  return { answer: result.answer };
}
