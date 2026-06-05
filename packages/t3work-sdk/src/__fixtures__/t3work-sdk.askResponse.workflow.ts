// user.ask fixture: escalate to the user with a typed responseSchema and await the reply.
// The ask records a "sent" entry; the reply lands as a "resolved" entry keyed by the same
// correlationId. If the reply is not yet present the body suspends on `await h.response`,
// and a resume replays to the same await once the reply has been appended.
import { Schema } from "effect";

export const Inputs = Schema.Struct({ question: Schema.String });

export const Outputs = Schema.Struct({ answer: Schema.String });

export const meta = {
  name: "fixtures.ask-response",
  description: "Asks the user a question and returns the typed reply.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;

const input = Schema.decodeSync(Inputs)(args);

const Answer = Schema.Struct({ answer: Schema.String });
const handle = await user.ask({ title: input.question, responseSchema: Answer });
const reply = await handle.response;

return { answer: reply.answer };
