import { Schema } from "effect";
import { defineWorkflow, getArgs, workflow } from "@t3team/sdk";

import type * as Child from "./t3team-sdk.subInterceptChild.workflow.ts";

export const Inputs = Schema.Struct({ topic: Schema.String });
export const Outputs = Schema.Struct({ summary: Schema.String });

export const meta = {
  name: "fixtures.sub-intercept-thread-turn-parent",
  description:
    "Runs the agent-calling child as a sub-workflow but supplies its thread.turn result " +
    "itself — the deterministic-sub-runbook-testing case workflow()'s third parameter exists for.",
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
          by: "fixtures.deterministic-agent-mock",
          handle: async () => "a deterministically mocked summary",
        },
      },
    },
  );
  return { summary: result.summary };
}
