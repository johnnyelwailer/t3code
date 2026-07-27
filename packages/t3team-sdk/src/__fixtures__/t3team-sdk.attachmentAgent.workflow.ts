// First-class-attachment fixture. The author passes the gate objects THEMSELVES — no
// JSON.stringify, no data concatenated into the prompt — one named and one bare, so the paired
// test covers both spellings. The runtime names them, journals them as structure, and the host
// serializes them once when it composes the provider turn.
import { Schema } from "effect";
import { agent, getArgs } from "@t3team/sdk";

export const Inputs = Schema.Struct({
  gates: Schema.Array(Schema.Struct({ id: Schema.String, ok: Schema.Boolean })),
});

export const Outputs = Schema.Struct({ reply: Schema.String });

export const meta = {
  name: "fixtures.attachment-agent",
  description: "An agent ask that carries structured data as attachments.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

export default async function run() {
  const args = getArgs();

  const input = Schema.decodeSync(Inputs)(args);

  // `effort` names a thinking level, never a provider or a model — the host maps it onto whatever
  // reasoning control the current provider exposes.
  const reply = await agent("Judge these gates", {
    label: "Judge gates",
    effort: "high",
    attachments: [{ name: "gates", value: input.gates }, { policy: "strict" }],
  });

  return { reply };
}
