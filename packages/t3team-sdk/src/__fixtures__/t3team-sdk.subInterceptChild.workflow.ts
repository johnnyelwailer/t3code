import { Schema } from "effect";
import { agent, getArgs } from "@t3team/sdk";

export const Inputs = Schema.Struct({ topic: Schema.String });
export const Outputs = Schema.Struct({ summary: Schema.String });

export const meta = {
  name: "fixtures.sub-intercept-child",
  description:
    "A one-shot agent() call — the deterministic-sub-runbook-testing target: a caller can " +
    "supply this thread.turn's result via workflow()'s handler map instead of a real model.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

export default async function run() {
  const input = Schema.decodeSync(Inputs)(getArgs());
  const summary = await agent(`summarize ${input.topic}`, { capabilities: "inherit" });
  return { summary };
}
