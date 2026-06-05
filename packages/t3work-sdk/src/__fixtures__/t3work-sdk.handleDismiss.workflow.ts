// dismiss fixture: ask, then dismiss the handle WITHOUT awaiting its response. The dismissal
// records a terminal "resolved (dismissed)" entry, so a later real reply is ignored
// (first-write-wins). The body never suspends because it never awaits `.response`.
import { Schema } from "effect";

export const Outputs = Schema.Struct({ id: Schema.String, dismissed: Schema.Boolean });

export const meta = {
  name: "fixtures.handle-dismiss",
  description: "Asks the user, then dismisses the handle; never awaits the response.",
  outputs: Outputs,
  capabilities: ["user"],
} as const;

const Answer = Schema.Struct({ answer: Schema.String });
const handle = await user.ask({ title: "still relevant?", responseSchema: Answer });
await handle.dismiss();

return { id: handle.id, dismissed: true };
