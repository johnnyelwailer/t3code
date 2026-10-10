// Script-host fixture: the body hands its args to one recipe script, which does the real work
// through `ctx.changeRequests` and `ctx.store` (t3team-scriptHostContext.test.ts defines it).
import { Schema } from "effect";
import { getArgs, getScripts } from "@t3team/sdk";

export const Inputs = Schema.Struct({ repository: Schema.String, number: Schema.Number });
const decodeInputs = Schema.decodeSync(Inputs);

export const meta = {
  name: "fixtures.script-host",
  description: "Reads a change request and records it in the pack store from a script.",
  inputs: Inputs,
  capabilities: ["script"],
} as const;

export default async function run() {
  const input = decodeInputs(getArgs());
  return await getScripts<{ inspect: (input: unknown) => Promise<unknown> }>().inspect(input);
}
