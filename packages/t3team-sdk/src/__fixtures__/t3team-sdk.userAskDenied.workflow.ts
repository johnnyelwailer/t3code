// capability-gating fixture: this workflow does NOT declare "user" in meta.capabilities, so
// `thread.askUser` is bound to a thrower — calling it raises PermissionDeniedError at the call
// site, before the broker is ever touched.
import { Schema } from "effect";

export const meta = {
  name: "fixtures.user-ask-denied",
  description: "Calls thread.askUser without declaring the 'user' capability.",
} as const;

if (thread === undefined) throw new Error("fixtures.user-ask-denied requires a launching thread");

const Answer = Schema.Struct({ answer: Schema.String });
await thread.askUser("are you sure?", { schema: Answer });

return { ok: true };
