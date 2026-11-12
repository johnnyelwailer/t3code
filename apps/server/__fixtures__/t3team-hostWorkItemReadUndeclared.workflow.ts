// Host-tool fixture: a body that does NOT declare `integration.read` and searches the project's work items
// through the broker. Proves the SDK call-site gate refuses it.
import { Schema } from "effect";
import { getArgs, getTools } from "@t3team/sdk";

export const Inputs = Schema.Struct({ status: Schema.String });

export const meta = {
  name: "fixtures.host-work-item-read-undeclared",
  description: "Searches the project's work items through the host broker.",
  inputs: Inputs,
  capabilities: [],
} as const;

export default async function run() {
  const input = Schema.decodeSync(Inputs)(getArgs());
  const found = await getTools().t3team.workItem.search({ status: [input.status], limit: 5 });
  return { found };
}
