// callRef child that parks on an agent step: the parent run must park with it.
import { agent } from "@t3team/sdk";

export const meta = { name: "fixtures.call-ref-parks", description: "Waits on an agent." } as const;

export default async function run() {
  return await agent("Decide the merge mode.", { capabilities: "inherit" });
}
