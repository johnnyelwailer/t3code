// The cascade fixture's twin, byte-identical except that it declares NO `models` ladder. Used to
// prove the feature is inert for authors who don't opt in: no `model.resolve` line, no seq shift,
// and payload argsHashes identical to a payload with no cascade key at all.
import { Schema } from "effect";
import { agent } from "@t3team/sdk";

export const Outputs = Schema.Struct({ verdict: Schema.String });

export const meta = {
  name: "fixtures.model-cascade-absent",
  description: "One agent() call with no fallback ladder.",
  outputs: Outputs,
} as const;

export default async function run() {
  const verdict = await agent("judge this gate", { label: "Judge gate" });

  return { verdict };
}
