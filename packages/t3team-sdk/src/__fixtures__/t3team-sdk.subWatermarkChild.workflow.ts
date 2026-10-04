// Sub-workflow whose body attempts `watermark()`: a watermark advance commits a checkpoint
// boundary, so the sub-workflow checkpoint guard must refuse it exactly like `checkpoint()`.
import { Schema } from "effect";
import { watermark } from "@t3team/sdk";

export const Outputs = Schema.Struct({ ok: Schema.Boolean });

export const meta = {
  name: "fixtures.sub-watermark-child",
  description: "Attempts watermark() from inside a sub-workflow body.",
  outputs: Outputs,
  capabilities: ["source:work-item.updates"],
} as const;

export default async function run() {
  await watermark<number>("work-item.updates").advance(1);
  return { ok: true };
}
