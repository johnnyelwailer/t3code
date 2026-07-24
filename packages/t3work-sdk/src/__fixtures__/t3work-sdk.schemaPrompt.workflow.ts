// Implicit-schema-description fixture. The whole point: the prompt below contains NO JSON
// example and NO restatement of the shape — a "business focused" definition only. The runtime
// derives the shape + example from `schema` and appends it, so a lenient mid-size model still
// returns a decodable reply. The paired test resolves the turn by echoing the example the
// runtime put in the prompt; if the description were missing, the ask could not be answered.
import { Schema } from "effect";

export const Inputs = Schema.Struct({ gate: Schema.String });

const Verdict = Schema.Struct({
  verdict: Schema.Literals(["pass", "fail"]),
  score: Schema.Number.annotate({ description: "0-10, higher is better" }),
  blockers: Schema.Array(Schema.String),
  note: Schema.optional(Schema.String),
});

export const Outputs = Schema.Struct({ verdict: Schema.String, score: Schema.Number });

export const meta = {
  name: "fixtures.schema-prompt",
  description: "A schema-typed agent ask whose prompt never restates the schema.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

const input = Schema.decodeSync(Inputs)(args);

const judged = await agent(`Judge gate ${input.gate}`, {
  label: "Judge gate",
  schema: Verdict,
});

return { verdict: judged.verdict, score: judged.score };
