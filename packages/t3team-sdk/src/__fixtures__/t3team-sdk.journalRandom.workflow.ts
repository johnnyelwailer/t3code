// Determinism fixture: the body draws entropy via `Math.random()`. Each draw is journaled
// (PrimitiveKind "random"), so a resume replays the recorded floats. `scaled` also exercises
// `Math.floor` to prove the non-random Math members still pass through to the real Math.
import { Schema } from "effect";

export const Inputs = Schema.Struct({});

export const Outputs = Schema.Struct({
  a: Schema.Number,
  b: Schema.Number,
  scaled: Schema.Number,
});

export const meta = {
  name: "fixtures.journal-random",
  description: "Draws Math.random() twice; both journal and replay deterministically.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

const a = Math.random();
const b = Math.random();

return { a, b, scaled: Math.floor(a * 1000) };
