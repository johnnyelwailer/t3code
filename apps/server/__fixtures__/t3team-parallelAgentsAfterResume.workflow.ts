import { Schema } from "effect";

export const Inputs = Schema.Struct({});
export const Outputs = Schema.Struct({ count: Schema.Number });
export const meta = {
  name: "test.parallel-agents-after-resume",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;

const Seed = Schema.Struct({ summary: Schema.String });
await agent("Create a seed summary", { schema: Seed, label: "Seed" });

const replies = await parallel([
  () => agent("Parallel child one", { label: "Child one" }),
  () => agent("Parallel child two", { label: "Child two" }),
  () => agent("Parallel child three", { label: "Child three" }),
]);

if (thread === undefined) throw new Error("launch thread required");
await thread.notifyUser("Parallel children complete");
return { count: replies.length };
