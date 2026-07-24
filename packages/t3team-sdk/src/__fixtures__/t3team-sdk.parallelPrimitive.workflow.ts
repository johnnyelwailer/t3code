// parallel fixture: a barrier fanout of three thunks, the middle one throwing (→ null slot).
// The whole `parallel` is ONE journal entry (kind "parallel"); the tool calls inside the
// thunks are black-boxed (not individually journaled), so on resume the recorded array is
// returned verbatim and no thunk — and no tool call — re-fires.
import { Schema } from "effect";

export const Inputs = Schema.Struct({});

export const Outputs = Schema.Struct({
  results: Schema.Array(Schema.NullOr(Schema.String)),
});

export const meta = {
  name: "fixtures.parallel-primitive",
  description: "Barrier fanout; a failing thunk resolves to null in its slot.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

const results = await parallel([
  async () => {
    await tools.demo.noop({ note: "p1" });
    return "r1";
  },
  async () => {
    throw new Error("thunk boom");
  },
  async () => {
    await tools.demo.noop({ note: "p3" });
    return "r3";
  },
]);

return { results };
