// Decision-card fixture whose literal options are themselves valid JSON ("true"/"false").
// Regression guard: an in-options reply must reach the literal decode AS THE STRING — running
// the JSON-reply coercion on it would turn "true" into boolean true and fail the decode.
import { Schema } from "effect";

export const Inputs = Schema.Struct({ question: Schema.String });

export const Outputs = Schema.Struct({ confirmed: Schema.String });

export const meta = {
  name: "fixtures.ask-choice-json",
  description: "Asks a yes/no question whose option literals are JSON-parseable strings.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;

const input = Schema.decodeSync(Inputs)(args);

if (thread === undefined) throw new Error("fixtures.ask-choice-json requires a launching thread");

const Confirm = Schema.Literals(["true", "false"]);
const confirmed = await thread.askUser(input.question, { schema: Confirm });

return { confirmed };
