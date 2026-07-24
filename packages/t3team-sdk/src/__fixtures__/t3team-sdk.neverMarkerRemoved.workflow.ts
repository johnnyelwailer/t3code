// Regression fixture (edited): identical to neverMarkerBase but with the replay:never
// `freshTicket` call removed. Resuming a base-run journal with this body lands `farewell`
// on the seq the never-marker occupies → ReplayDriftError instead of a silent re-execute.
import { Schema } from "effect";

export const Inputs = Schema.Struct({ name: Schema.String });

export const Outputs = Schema.Struct({
  greeting: Schema.String,
  farewell: Schema.String,
});

export const meta = {
  name: "fixtures.never-marker-removed",
  description: "greet (journaled) → farewell (journaled); freshTicket removed (drift fixture).",
  inputs: Inputs,
  outputs: Outputs,
} as const;

const input = Schema.decodeSync(Inputs)(args);

const greeting = await scripts.greet({ name: input.name });
const farewell = await scripts.farewell({ name: input.name });

return { greeting: greeting.text, farewell: farewell.text };
