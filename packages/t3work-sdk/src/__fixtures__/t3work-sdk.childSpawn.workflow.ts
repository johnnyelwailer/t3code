// child.spawn fixture: spawn a child with a typed responseSchema, await its reply, then send
// a fire-and-forget follow-up to the child handle (exercising a ChildHandle ThreadTarget).
import { Schema } from "effect";

export const Outputs = Schema.Struct({ summary: Schema.String });

export const meta = {
  name: "fixtures.child-spawn",
  description: "Spawns a child, awaits its summary, then pings it back.",
  outputs: Outputs,
  capabilities: ["child", "thread"],
} as const;

const Summary = Schema.Struct({ summary: Schema.String });
const worker = await child.spawn({
  name: "summarize",
  kickoffPrompt: "summarize the thread",
  responseSchema: Summary,
});
const reply = await worker.response;
await thread.send(worker, { kind: "ack" });

return { summary: reply.summary };
