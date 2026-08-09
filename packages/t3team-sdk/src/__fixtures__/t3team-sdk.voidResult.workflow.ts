// Regression fixture: a tool whose handler returns `undefined` must journal + replay
// cleanly. Before the fix, JSON.stringify dropped the `result` key and resume failed to
// decode ("Missing key at result"). Exercises reviewer finding B1 (result envelope).
import { Schema } from "effect";
import { getArgs, getTools } from "@t3team/sdk";

export const Inputs = Schema.Struct({ note: Schema.String });

export const Outputs = Schema.Struct({ ok: Schema.Boolean });

export const meta = {
  name: "fixtures.void-result",
  description: "Calls a tool that returns undefined; the void result must round-trip.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["demo.read"], // tool-group gate: the demo tools' group (Epic 25 §Tools)
} as const;

export default async function run() {
  const args = getArgs();
  const tools = getTools();

  const input = Schema.decodeSync(Inputs)(args);

  await tools.demo.noop({ note: input.note });

  return { ok: true };
}
