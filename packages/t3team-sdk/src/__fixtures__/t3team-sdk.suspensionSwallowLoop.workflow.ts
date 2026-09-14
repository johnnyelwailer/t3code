// Regression fixture: swallowing the suspension signal INSIDE A LOOP.
//
// The dangerous shape is not the wrong return value — it is the second side effect. Without the
// latch, iteration 2 takes a fresh `seq`, journals another `sent` entry and fires another
// question at the user, and so on: one swallowed suspension multiplies into N live asks the run
// can never line up on resume. The latch re-throws at `send`, BEFORE takeSeq, so exactly one ask
// leaves the body no matter how many times the loop turns.
import { Schema } from "effect";
import { getThread } from "@t3team/sdk";

export const Inputs = Schema.Struct({});

export const Outputs = Schema.Struct({ caught: Schema.Number });

export const meta = {
  name: "fixtures.suspension-swallow-loop",
  description: "Swallows the suspension signal on every iteration of a three-turn loop.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;

export default async function run() {
  const thread = getThread();
  if (thread === undefined) throw new Error("fixtures.suspension-swallow-loop needs a thread");

  let caught = 0;
  for (let index = 0; index < 3; index += 1) {
    try {
      await thread.askUser(`Question ${index}`, { schema: Schema.String });
    } catch {
      caught += 1;
    }
  }
  return { caught };
}
