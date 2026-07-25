// Phase-25.5 static-capability fixture: the same gated verbs, fully declared. Must be CLEAN.
import { Schema } from "effect";

export const Inputs = Schema.Struct({});

export const meta = {
  name: "fixtures.capability-ok",
  inputs: Inputs,
  description: "Every gated verb declared in meta.capabilities.",
  capabilities: ["user", "script", "schedule"],
} as const;

const answer = await thread.askUser("Approve?");
thread.notifyUser("done");
const prepared = await scripts.prepareWorkspace({ answer });
await waitUntil(now() + 1000);

return { answer, prepared };
