// askUser fixture: drive the launching thread's user with a typed schema and await the reply.
// The ask records a "sent" entry; the reply lands as a "resolved" entry keyed by the same
// correlationId. If the reply is not yet present the body suspends, and a resume replays to
// the same await once the reply has been appended.
import { Schema } from "effect";

export const Inputs = Schema.Struct({ question: Schema.String });

export const Outputs = Schema.Struct({ answer: Schema.String });

export const meta = {
  name: "fixtures.ask-response",
  description: "Asks the launching user a question and returns the typed reply.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;

const input = Schema.decodeSync(Inputs)(args);

if (thread === undefined) throw new Error("fixtures.ask-response requires a launching thread");

// A plain-string (freeform) ask: the schema implies a `text` affordance, so the user.input
// payload carries no affordance/attachments key — byte-identical to a pre-decision-card journal.
const reply = await thread.askUser(input.question, { schema: Schema.String });

return { answer: reply };
