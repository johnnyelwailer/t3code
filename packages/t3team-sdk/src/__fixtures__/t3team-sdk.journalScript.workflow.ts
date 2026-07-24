// Script-dispatch fixture: exercises the `scripts.*` path of the durable runtime. `greet`
// is a normal (journaled) script; `freshTicket` is declared `replay: "never"`, so it is
// excluded from the journal and re-runs on every resume — yielding a different ticket each
// time while the greeting replays unchanged.
import { Schema } from "effect";

export const Inputs = Schema.Struct({
  name: Schema.String,
});

export const Outputs = Schema.Struct({
  greeting: Schema.String,
  ticket: Schema.String,
});

export const meta = {
  name: "fixtures.journal-script",
  description: "Greet via a journaled script and mint a fresh (never-replayed) ticket.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

const input = Schema.decodeSync(Inputs)(args);

const greeting = await scripts.greet({ name: input.name });
const ticket = await scripts.freshTicket({});

return { greeting: greeting.text, ticket: ticket.id };
