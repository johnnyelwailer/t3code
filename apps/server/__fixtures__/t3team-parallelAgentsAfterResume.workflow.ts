import { Schema } from "effect";
import { agent, getThread, parallel } from "@t3team/sdk";

export const Inputs = Schema.Struct({});
export const Outputs = Schema.Struct({ count: Schema.Number });
export const meta = {
  name: "test.parallel-agents-after-resume",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;

export default async function run() {
  const thread = getThread();

  const Seed = Schema.Struct({ summary: Schema.String });
  await agent("Create a seed summary", { schema: Seed, label: "Seed", capabilities: "inherit" });

  // Each fanout child states its own grant: `parallel` is a journaling black box, so a child
  // spawned inside a thunk is no less of a deliberate grant than one spawned at the top level.
  const replies = await parallel([
    () => agent("Parallel child one", { label: "Child one", capabilities: "inherit" }),
    () => agent("Parallel child two", { label: "Child two", capabilities: "inherit" }),
    () => agent("Parallel child three", { label: "Child three", capabilities: "inherit" }),
  ]);

  if (thread === undefined) throw new Error("launch thread required");
  await thread.notifyUser("Parallel children complete");
  return { count: replies.length };
}
