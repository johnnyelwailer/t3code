// Decision-card fixture (Epic 25 §askUser decision cards): a single `askUser` with a
// string-literal choice schema and an attached external resource. The escalation message must
// carry the `workflow.decision` view (question + affordance) plus the resource attachment, and
// the run completes with the chosen literal.
import { Schema } from "effect";

export const Inputs = Schema.Struct({ question: Schema.String });

export const Outputs = Schema.Struct({ decision: Schema.String });

export const meta = {
  name: "fixtures.decision-choice",
  description: "Asks the user to pick a release decision for an attached bug.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;

const input = Schema.decodeSync(Inputs)(args);

if (thread === undefined) throw new Error("fixtures.decision-choice requires a launching thread");

const Decision = Schema.Literals(["ship-now", "hold", "rollback"]);
const decision = await thread.askUser(input.question, {
  schema: Decision,
  attachments: [
    {
      provider: "jira",
      kind: "issue",
      id: "BUG-7",
      displayId: "BUG-7",
      title: "Checkout rounding error",
      url: "https://example.atlassian.net/browse/BUG-7",
      status: "Open",
    },
  ],
});

return { decision };
