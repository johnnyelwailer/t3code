// fire-and-forget fixture: spawnThread + notifyAgent + notifyUser each record a single "sent"
// entry and never suspend — `notify*` return void, so the body cannot await a reply.
import { Schema } from "effect";

export const Outputs = Schema.Struct({ threadId: Schema.String });

export const meta = {
  name: "fixtures.fire-forget",
  description: "Spawns a thread and posts two one-way messages; neither awaits a reply.",
  outputs: Outputs,
  capabilities: ["user"],
} as const;

const worker = spawnThread({ name: "worker" });
worker.notifyAgent("heads up");
worker.notifyUser("fyi");

return { threadId: worker.id.id };
