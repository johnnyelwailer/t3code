// Folds into a reducer, then attempts a plain `checkpoint()`: refused, because a resume from that
// author-state-only boundary would silently restart the reducer.
import { Schema } from "effect";
import { accumulate, checkpoint } from "@t3team/sdk";

export const Outputs = Schema.Struct({ ok: Schema.Boolean });

export const meta = {
  name: "fixtures.accumulate-then-checkpoint",
  description: "Attempts a plain checkpoint() after accumulate().",
  outputs: Outputs,
} as const;

export default async function run() {
  await accumulate("total", (t: number | undefined, n: number) => (t ?? 0) + n, 1);
  await checkpoint({ state: { i: 1 } });
  return { ok: true };
}
