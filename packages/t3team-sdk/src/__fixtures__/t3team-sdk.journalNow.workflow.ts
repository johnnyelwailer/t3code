// Determinism fixture: the body reads wall-clock time via `Date.now()` and `new Date()`.
// Both are journaled (PrimitiveKind "now"), so a resume replays the recorded millis rather
// than reading the clock again — `stamp`, `iso`, and `viaNew` come back identical.
import { Schema } from "effect";

export const Inputs = Schema.Struct({});

export const Outputs = Schema.Struct({
  stamp: Schema.Number,
  iso: Schema.String,
  viaNew: Schema.Number,
});

export const meta = {
  name: "fixtures.journal-now",
  description: "Reads Date.now() and new Date(); both journal and replay deterministically.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

const stamp = Date.now();
const d = new Date();

return { stamp, iso: d.toISOString(), viaNew: d.getTime() };
