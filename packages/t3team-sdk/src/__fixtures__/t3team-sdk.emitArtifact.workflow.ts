// Artifact-emission fixture: the body emits a typed artifact through the `emit` verb. The
// artifact call is journaled (kind "artifact"), so a resume replays the recorded record — the
// artifact id comes back identical to the original run.
import { Schema } from "effect";
import { emit } from "@t3team/sdk";

export const Inputs = Schema.Struct({});

export const Outputs = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
});

export const meta = {
  name: "fixtures.emit-artifact",
  description: "Emits one typed artifact and returns its record id and type.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

export default async function run() {
  const record = await emit({ type: "report", title: "Q3", data: { rows: 3 } });

  return { id: record.id, type: record.type };
}
