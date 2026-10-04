// Sub-workflow whose body attempts `accumulate()`: the sub-workflow checkpoint guard must refuse
// it — every fold commits a checkpoint boundary, which would move the run's shared replay window.
import { Schema } from "effect";
import { accumulate } from "@t3team/sdk";

export const Outputs = Schema.Struct({ total: Schema.Number });

export const meta = {
  name: "fixtures.sub-accumulate-child",
  description: "Attempts accumulate() from inside a sub-workflow body.",
  outputs: Outputs,
} as const;

export default async function run() {
  const total = await accumulate("total", (t: number | undefined, n: number) => (t ?? 0) + n, 1);
  return { total };
}
