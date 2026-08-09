// A minimal writer workflow: ONE `askAgent` on the launch thread whose reply IS the output, plus
// the emptiness guard a real writer body has. It exists for the regression in
// `t3team-workflowEngineTurnAnswer.integration.test.ts`: a turn that narrates a plan and calls
// tools before answering must resolve with the ANSWER, and a turn that says nothing must fail.
import { Schema } from "effect";
import { getThread } from "@t3team/sdk";

export const Inputs = Schema.Struct({});

export const Outputs = Schema.Struct({ answer: Schema.String });

export const meta = {
  name: "test.writer-turn",
  description: "Ask one agent turn on the launching thread and return its final answer.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: [],
} as const;

export default async function run() {
  const thread = getThread();
  if (thread === undefined) throw new Error("test.writer-turn needs a launching thread");
  const answer = (await thread.askAgent("Write the description.", { label: "Write" })).trim();
  if (answer.length === 0) {
    throw new Error("The writer returned no description text, so there is nothing to propose.");
  }
  return { answer };
}
