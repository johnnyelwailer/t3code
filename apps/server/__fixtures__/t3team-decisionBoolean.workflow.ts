// Decision-card fixture (Epic 25 §askUser decision cards — boolean affordance): a single
// `askUser` whose schema is `Schema.Boolean` with custom approve/reject labels. The escalation
// message must carry the `workflow.decision` view with a `boolean` affordance, and the run
// completes with the chosen boolean.
import { Schema } from "effect";

export const Inputs = Schema.Struct({ question: Schema.String });

export const Outputs = Schema.Struct({ approved: Schema.Boolean });

export const meta = {
  name: "fixtures.decision-boolean",
  description: "Asks the user to approve or reject a release.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;

const input = Schema.decodeSync(Inputs)(args);

if (thread === undefined) throw new Error("fixtures.decision-boolean requires a launching thread");

const approved = await thread.askUser(input.question, {
  schema: Schema.Boolean,
  labels: { true: "Ship it", false: "Hold" },
});

return { approved };
