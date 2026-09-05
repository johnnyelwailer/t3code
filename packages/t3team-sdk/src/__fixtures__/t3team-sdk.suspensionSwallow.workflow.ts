// Regression fixture: the idiomatic defensive try/catch around a SUSPENDING primitive.
//
// `WorkflowSuspended` travels as an ordinary Error through the body, so a bare `catch (e)` sees
// it. Before the suspension latch this run COMPLETED with the catch branch's value — a confident
// wrong answer for a question the user never answered. It must suspend instead, and on resume
// take the try branch with the real reply.
import { Schema } from "effect";
import { getThread } from "@t3team/sdk";

export const Inputs = Schema.Struct({});

export const Outputs = Schema.Struct({
  satisfied: Schema.Boolean,
  answer: Schema.String,
  errorName: Schema.String,
});

export const meta = {
  name: "fixtures.suspension-swallow",
  description: "Wraps a suspending askUser in try/catch and returns a fallback from the catch.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;

export default async function run() {
  const thread = getThread();
  if (thread === undefined) throw new Error("fixtures.suspension-swallow needs a launch thread");

  try {
    const answer = await thread.askUser("Ship it?", { schema: Schema.String });
    return { satisfied: true, answer, errorName: "" };
  } catch (error) {
    return {
      satisfied: false,
      answer: "",
      errorName: error instanceof Error ? error.name : typeof error,
    };
  }
}
