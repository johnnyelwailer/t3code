import { Schema } from "effect";
import { defineWorkflow, getArgs, workflow } from "@t3team/sdk";

import type * as Child from "./t3team-sdk.subInterceptChild.workflow.ts";

export const Inputs = Schema.Struct({ topic: Schema.String });
export const Outputs = Schema.Struct({ summary: Schema.String });

export const meta = {
  name: "fixtures.sub-intercept-throwing-parent",
  description:
    "A handler that cannot answer must throw, not defer — this fixture pins that the throw " +
    "surfaces as a real error out of workflow(), rather than silently falling through to the host.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

export default async function run() {
  const input = Schema.decodeSync(Inputs)(getArgs());
  const child = defineWorkflow<typeof Child>("./t3team-sdk.subInterceptChild.workflow.ts");
  const result = await workflow(
    child,
    { topic: input.topic },
    {
      handlers: {
        "thread.turn": {
          by: "fixtures.flaky-mock",
          handle: async () => {
            throw new Error("the mock cannot answer this one");
          },
        },
      },
    },
  );
  return { summary: result.summary };
}
