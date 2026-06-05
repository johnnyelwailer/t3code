// fire-and-forget fixture: ui.show (no responseSchema → Handle<never>) and user.notify each
// record a single "sent" entry and never suspend — there is no `.response` on the type, so
// the body cannot await a reply.
import { Schema } from "effect";

export const Outputs = Schema.Struct({ bannerId: Schema.String, noteId: Schema.String });

export const meta = {
  name: "fixtures.fire-forget",
  description: "Renders a banner and notifies the user; neither awaits a reply.",
  outputs: Outputs,
  capabilities: ["ui", "user"],
} as const;

const banner = await ui.show({ message: "Working…" });
const note = await user.notify("All done.");

return { bannerId: banner.id, noteId: note.id };
