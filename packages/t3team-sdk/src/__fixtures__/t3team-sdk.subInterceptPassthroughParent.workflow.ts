import { Schema } from "effect";
import { defineWorkflow, getArgs, workflow } from "@t3team/sdk";

import type * as Child from "./t3team-sdk.subInterceptChild.workflow.ts";

export const Inputs = Schema.Struct({ topic: Schema.String });
export const Outputs = Schema.Struct({ summary: Schema.String });

export const meta = {
  name: "fixtures.sub-intercept-passthrough-parent",
  description:
    "Declares a handler for 'wait.until' only — a kind the child never fires — so its " +
    "thread.create/thread.turn must reach the real host completely unchanged.",
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
        "wait.until": {
          by: "fixtures.unused-mock",
          handle: async () => {
            throw new Error("must never be called — this fixture fires no wait.until");
          },
        },
      },
    },
  );
  return { summary: result.summary };
}
