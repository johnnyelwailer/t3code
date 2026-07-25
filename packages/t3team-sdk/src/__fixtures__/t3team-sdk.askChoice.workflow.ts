// askUser decision-card fixture: a string-literal choice schema plus resource attachments.
// The `user.input` payload must carry the derived affordance descriptor and the attachment
// refs so the host can render the decision card; the chosen literal resolves the ask.
import { Schema } from "effect";

export const Inputs = Schema.Struct({ question: Schema.String });

export const Outputs = Schema.Struct({ decision: Schema.String });

export const meta = {
  name: "fixtures.ask-choice",
  description: "Asks the launching user to pick one of three literal options.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;

const input = Schema.decodeSync(Inputs)(args);

if (thread === undefined) throw new Error("fixtures.ask-choice requires a launching thread");

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
