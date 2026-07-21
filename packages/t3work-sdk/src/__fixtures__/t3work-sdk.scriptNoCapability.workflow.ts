// Capability-gate fixture (Epic 25 §Scripts): calls `scripts.greet` WITHOUT declaring the
// `"script"` engine capability, so the loader binds an EMPTY `scripts.*` tree and the call
// fails — even when the run options register the script.
import { Schema } from "effect";

export const Inputs = Schema.Struct({
  name: Schema.String,
});

export const Outputs = Schema.Struct({
  greeting: Schema.String,
});

export const meta = {
  name: "fixtures.script-no-capability",
  description: "Calls scripts.greet without the 'script' engine capability.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

const input = Schema.decodeSync(Inputs)(args);

const greeting = await scripts.greet({ name: input.name });

return { greeting: greeting.text };
