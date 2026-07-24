// Sub-workflow child: invoked via `workflow()` from the parent fixture. Its script call runs
// black-boxed inside the parent's `workflow` journal entry, so it is not individually
// journaled and does not re-fire when the parent replays.
import { Schema } from "effect";

export const Inputs = Schema.Struct({ name: Schema.String });

export const Outputs = Schema.Struct({ greeting: Schema.String });

export const meta = {
  name: "fixtures.sub-child",
  description: "Greets a name via a script call; run as a sub-workflow.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

const input = Schema.decodeSync(Inputs)(args);

const greeted = await scripts.greet({ name: input.name });

return { greeting: greeted.text };
