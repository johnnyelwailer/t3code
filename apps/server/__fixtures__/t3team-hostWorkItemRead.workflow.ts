// Host-tool fixture: a body that DECLARES `integration.read` and searches the project's work items
// through the broker. Proves `getTools()` reaches the read tools under the same gates as the drafts.
import { Schema } from "effect";
import { getArgs, getTools } from "@t3team/sdk";

export const Inputs = Schema.Struct({ status: Schema.String });

export const meta = {
  name: "fixtures.host-work-item-read",
  description: "Searches the project's work items through the host broker.",
  inputs: Inputs,
  capabilities: ["integration.read"],
} as const;

export default async function run() {
  const input = Schema.decodeSync(Inputs)(getArgs());
  const found = await getTools().t3team.workItem.search({ status: [input.status], limit: 5 });
  return { found };
}
