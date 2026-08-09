// Agent fixture: one bare `agent(prompt)` (returns text) and one `agent(prompt, { schema })`
// (returns a validated structured value). Both are journaled (kind "agent"); on resume the
// recorded results replay and the LLM dispatcher is NOT re-invoked.
import { Schema } from "effect";
import { agent, getArgs } from "@t3team/sdk";

export const Inputs = Schema.Struct({ topic: Schema.String });

export const Outputs = Schema.Struct({
  summary: Schema.String,
  sentiment: Schema.String,
});

export const meta = {
  name: "fixtures.agent-primitive",
  description: "One text agent call and one schema-typed agent call.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

export default async function run() {
  const args = getArgs();

  const input = Schema.decodeSync(Inputs)(args);

  // `capabilities` is required on every subagent: this body declares none, so "inherit" is an
  // explicit "the child gets nothing either" rather than a default nobody chose.
  const summary = await agent(`summarize ${input.topic}`, { capabilities: "inherit" });

  const Sentiment = Schema.Struct({ sentiment: Schema.String });
  const classified = await agent(`classify ${input.topic}`, {
    label: "Classify cat sentiment",
    schema: Sentiment,
    capabilities: "inherit",
  });

  return { summary, sentiment: classified.sentiment };
}
