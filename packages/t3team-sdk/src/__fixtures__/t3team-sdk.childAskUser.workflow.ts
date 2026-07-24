import { Schema } from "effect";

export const Outputs = Schema.Struct({ answer: Schema.String });

export const meta = {
  name: "fixtures.child-ask-user",
  description: "Asks from a child while surfacing input in the launch thread.",
  outputs: Outputs,
  capabilities: ["user"],
} as const;

const child = spawnThread({ name: "worker" });
const answer = await child.askUser("Approve child work?", { schema: Schema.String });
return { answer };
