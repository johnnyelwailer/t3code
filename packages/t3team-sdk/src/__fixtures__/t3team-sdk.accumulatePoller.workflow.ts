// A bounded poller: each iteration observes a reading (a journaled tool call), passes a crash
// probe, and folds the reading into a reducer with `accumulate` (a checkpoint boundary). The
// reducer's own state is the loop cursor, so a checkpoint-window resume continues folding from
// the recorded state instead of re-running the superseded iterations.
import { Schema } from "effect";
import { accumulate, getArgs, getTools, reducerState } from "@t3team/sdk";

export const Inputs = Schema.Struct({ k: Schema.Number });
const decodeInputs = Schema.decodeSync(Inputs);

const Metrics = Schema.Struct({ n: Schema.Number, total: Schema.Number, max: Schema.Number });

export const Outputs = Schema.Struct({ current: Metrics, ring: Schema.Array(Schema.Number) });

export const meta = {
  name: "fixtures.accumulate-poller",
  description: "Folds tool readings into a bounded reducer with accumulate().",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["reduceDemo.read"],
} as const;

const foldMetrics = (current: typeof Metrics.Type | undefined, reading: number) => ({
  n: (current?.n ?? 0) + 1,
  total: (current?.total ?? 0) + reading,
  max: Math.max(current?.max ?? reading, reading),
});

export default async function run() {
  const { k } = decodeInputs(getArgs());
  const tools = getTools();

  for (let i = reducerState<typeof Metrics.Type>("metrics")?.current.n ?? 0; i < k; i++) {
    const { reading } = await tools.reduceDemo.observe({ i });
    await tools.reduceDemo.probe({ i });
    await accumulate("metrics", foldMetrics, reading, { retention: { ring: 3 } });
  }

  return reducerState("metrics");
}
