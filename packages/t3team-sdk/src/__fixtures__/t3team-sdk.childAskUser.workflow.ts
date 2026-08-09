import { Schema } from "effect";
import { spawnThread } from "@t3team/sdk";

export const Outputs = Schema.Struct({ answer: Schema.String });

export const meta = {
  name: "fixtures.child-ask-user",
  description: "Asks from a child while surfacing input in the launch thread.",
  outputs: Outputs,
  capabilities: ["user"],
} as const;

export default async function run() {
  // The child inherits `["user"]`, which is what lets the escalation below surface at all.
  const child = spawnThread({ name: "worker", capabilities: "inherit" });
  const answer = await child.askUser("Approve child work?", { schema: Schema.String });
  return { answer };
}
