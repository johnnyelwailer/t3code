// spawnThread fixture: spawn an isolated thread, drive a schema-typed agent turn on it, await
// the validated reply, then post a fire-and-forget follow-up to the same thread. Exercises
// thread.create (one-way) + thread.turn (ask) + thread.message (one-way) in one body.
import { Schema } from "effect";

export const Outputs = Schema.Struct({ summary: Schema.String });

export const meta = {
  name: "fixtures.child-spawn",
  description: "Spawns a thread, awaits a schema-typed summary, then pings it back.",
  outputs: Outputs,
} as const;

const Summary = Schema.Struct({ summary: Schema.String });
const worker = spawnThread({ name: "summarize", retention: "retained" });
const reply = await worker.askAgent("summarize the thread", { schema: Summary });
worker.notifyAgent("thanks");

return { summary: reply.summary };
