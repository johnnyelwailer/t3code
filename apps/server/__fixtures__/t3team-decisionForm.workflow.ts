// Decision-card fixture (Epic 25 §askUser decision cards — form affordance): a single `askUser`
// whose schema is a flat scalar Struct (a literal field + a string + a boolean). The escalation
// message must carry the `workflow.decision` view with a `form` affordance, and the run completes
// with the submitted, schema-validated object.
import { Schema } from "effect";

export const Inputs = Schema.Struct({ question: Schema.String });

const Triage = Schema.Struct({
  severity: Schema.Literals(["low", "high"]),
  note: Schema.String,
  urgent: Schema.Boolean,
});

export const Outputs = Triage;

export const meta = {
  name: "fixtures.decision-form",
  description: "Asks the user to triage an attached bug with a small form.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;

const input = Schema.decodeSync(Inputs)(args);

if (thread === undefined) throw new Error("fixtures.decision-form requires a launching thread");

const triage = await thread.askUser(input.question, { schema: Triage });

return triage;
