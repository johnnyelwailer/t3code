// wait fixture: a single durable timer. The first run records `deadline = now + ms` and
// sleeps until it; a resume reads the recorded deadline and sleeps only the remainder (or
// returns immediately if the deadline has already passed).
import { Schema } from "effect";

export const Inputs = Schema.Struct({ ms: Schema.Number });

export const Outputs = Schema.Struct({ done: Schema.Boolean });

export const meta = {
  name: "fixtures.wait-primitive",
  description: "Suspends on a durable timer, then completes.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

const input = Schema.decodeSync(Inputs)(args);

await wait(input.ms);

return { done: true };
