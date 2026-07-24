// Regression fixture: a tool whose handler returns a bigint (not canonical JSON). The
// engine must reject the journal write with JournalSerializeError BEFORE corrupting the
// journal — the side effect already happened, so it must fail loud. Reviewer finding B1.
import { Schema } from "effect";

export const Inputs = Schema.Struct({});

export const Outputs = Schema.Struct({ ok: Schema.Boolean });

export const meta = {
  name: "fixtures.bigint-result",
  description: "Calls a tool that returns a bigint — must raise JournalSerializeError.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

await tools.demo.bigintResult({});

return { ok: true };
