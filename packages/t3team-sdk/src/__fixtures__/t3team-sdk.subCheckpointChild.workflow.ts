// Sub-workflow whose body attempts `checkpoint()`: the sub-workflow checkpoint guard must refuse
// it — the child journals into the parent's run sequence and shares the run's checkpoint
// primitive, so committing a boundary here would move the run's shared replay window.
import { Schema } from "effect";
import { checkpoint } from "@t3team/sdk";

export const Outputs = Schema.Struct({ ok: Schema.Boolean });

export const meta = {
  name: "fixtures.sub-checkpoint-child",
  description: "Attempts checkpoint() from inside a sub-workflow body.",
  outputs: Outputs,
} as const;

export default async function run() {
  await checkpoint({ state: { i: 1 } });
  return { ok: true };
}
