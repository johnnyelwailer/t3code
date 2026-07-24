// Regression fixture (base): a journaled script, then a replay:never script, then another
// journaled script after it. The never-script writes a typed marker so the call AFTER it
// keeps a stable seq. Pairs with neverMarkerRemoved to prove removing the never-script
// surfaces as ReplayDriftError. Exercises reviewer finding C1.
import { Schema } from "effect";

export const Inputs = Schema.Struct({ name: Schema.String });

export const Outputs = Schema.Struct({
  greeting: Schema.String,
  ticket: Schema.String,
  farewell: Schema.String,
});

export const meta = {
  name: "fixtures.never-marker-base",
  description: "greet (journaled) → freshTicket (replay:never) → farewell (journaled).",
  inputs: Inputs,
  outputs: Outputs,
} as const;

const input = Schema.decodeSync(Inputs)(args);

const greeting = await scripts.greet({ name: input.name });
const ticket = await scripts.freshTicket({});
const farewell = await scripts.farewell({ name: input.name });

return { greeting: greeting.text, ticket: ticket.id, farewell: farewell.text };
