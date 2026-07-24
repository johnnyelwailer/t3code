// pipeline fixture: per-item, two-stage pipeline. Stage 1 runs a (black-boxed) tool call;
// stage 2 is a pure transform. The whole `pipeline` is ONE journal entry (kind "pipeline"),
// so on resume the recorded array replays and the tool handler is not re-invoked.
import { Schema } from "effect";

export const Inputs = Schema.Struct({ labels: Schema.Array(Schema.String) });

export const Outputs = Schema.Struct({ out: Schema.Array(Schema.String) });

export const meta = {
  name: "fixtures.pipeline-primitive",
  description: "Two-stage pipeline: a tool-backed echo then a pure suffix transform.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

const input = Schema.decodeSync(Inputs)(args);

const out = await pipeline(
  [...input.labels],
  async (item) => {
    await tools.demo.noop({ note: String(item) });
    return `e${String(item)}`;
  },
  async (prev) => `${String(prev)}!`,
);

return { out };
