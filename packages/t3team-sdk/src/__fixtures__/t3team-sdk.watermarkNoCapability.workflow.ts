// Watermark fixture (capability gate): a watermark over `work-item.updates` WITHOUT declaring
// `source:work-item.updates` — `watermark()` must reject with PermissionDeniedError before
// anything is journaled.
import { Schema } from "effect";
import { watermark } from "@t3team/sdk";

export const Outputs = Schema.Struct({ ok: Schema.Boolean });

export const meta = {
  name: "fixtures.watermark-no-capability",
  description: "Creates a watermark without its source capability.",
  outputs: Outputs,
} as const;

export default async function run() {
  await watermark<number>("work-item.updates").advance(1);
  return { ok: true };
}
