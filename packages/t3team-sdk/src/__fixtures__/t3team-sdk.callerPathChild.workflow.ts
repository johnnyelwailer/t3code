// Sub-workflow child for the caller-path regression fixture: returns a marker so a parent body
// can prove the child actually ran. Deliberately capability-free — the test under it exercises
// relative path resolution, not tooling.
import { Schema } from "effect";

export const Outputs = Schema.Struct({ marker: Schema.String });

export const meta = {
  name: "fixtures.caller-path-child",
  description: "Returns a marker; invoked from the caller-path parent fixture.",
  outputs: Outputs,
  capabilities: [],
} as const;

export default async function run() {
  return { marker: "child ran" };
}
