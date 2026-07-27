// Host-tool fixture: a body that DECLARES the draft group and proposes a description rewrite
// through the broker's work-item draft tool. Proves `getTools()` reaches the t3team capability
// surface, and that the resulting draft is published to the launch thread for review.
import { Schema } from "effect";
import { getArgs, getTools } from "@t3team/sdk";

export const Inputs = Schema.Struct({ issueIdOrKey: Schema.String, body: Schema.String });

export const meta = {
  name: "fixtures.host-draft-tool",
  description: "Proposes a work-item description draft through the host broker.",
  inputs: Inputs,
  capabilities: ["mutation.draft"],
} as const;

export default async function run() {
  const input = Schema.decodeSync(Inputs)(getArgs());

  const proposed = await getTools().t3team.workItem.description.draftUpdate({
    issue_id: input.issueIdOrKey,
    body: input.body,
  });

  return { proposed };
}
