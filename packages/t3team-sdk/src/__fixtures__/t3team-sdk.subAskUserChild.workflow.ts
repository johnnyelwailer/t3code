import { Schema } from "effect";
import { getArgs, getThread } from "@t3team/sdk";

export const Inputs = Schema.Struct({ subject: Schema.String });
export const Outputs = Schema.Struct({ answer: Schema.String });

export const meta = {
  name: "fixtures.sub-ask-user-child",
  description: "Escalates a question to the user from inside a sub-workflow.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;

export default async function run() {
  const input = Schema.decodeSync(Inputs)(getArgs());
  // `getThread()` is the LAUNCHING thread, not a thread of this sub-run's own: the host passes
  // `launchThreadId` straight down, so a question asked at any nesting depth reaches the person
  // who started the run rather than disappearing into a nested context they cannot see.
  const thread = getThread();
  if (thread === undefined) throw new Error("sub-ask-user-child needs a launching thread");
  const answer = await thread.askUser(`Approve ${input.subject}?`, { schema: Schema.String });
  return { answer };
}
