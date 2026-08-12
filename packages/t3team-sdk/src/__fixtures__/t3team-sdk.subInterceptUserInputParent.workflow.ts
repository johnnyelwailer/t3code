import { Schema } from "effect";
import { defineWorkflow, getArgs, workflow } from "@t3team/sdk";

import type * as Child from "./t3team-sdk.subAskUserChild.workflow.ts";

export const Inputs = Schema.Struct({ subject: Schema.String });
export const Outputs = Schema.Struct({ answer: Schema.String });

export const meta = {
  name: "fixtures.sub-intercept-user-input-parent",
  description:
    "Runs the escalating askUser child as a sub-workflow, but answers its user.input itself " +
    "via workflow()'s third-parameter handler map instead of handing it to the real host.",
  inputs: Inputs,
  outputs: Outputs,
  // Must hold "user" itself: a child may declare a SUBSET of its caller's capabilities, never a
  // superset — unaffected by interception, which only changes who ANSWERS the effect.
  capabilities: ["user"],
} as const;

export default async function run() {
  const input = Schema.decodeSync(Inputs)(getArgs());
  const child = defineWorkflow<typeof Child>("./t3team-sdk.subAskUserChild.workflow.ts");
  const result = await workflow(
    child,
    { subject: input.subject },
    {
      handlers: {
        "user.input": {
          by: "fixtures.intercept-mock",
          handle: async () => "yes, approved by the mock",
        },
      },
    },
  );
  return { answer: result.answer };
}
