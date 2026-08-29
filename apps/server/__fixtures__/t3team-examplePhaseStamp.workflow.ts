// Fixture for the authored-phase stamping regression test (`t3team-workflowEnginePhaseStamp.test.ts`):
// two phases, one agent() turn each, no schema/askUser — kept minimal so the ONLY thing under
// test is whether each step activity is stamped with the `phase()` group active when it fired,
// correctly reconstructed across a genuine suspend/resume boundary between the two turns.
import { Schema } from "effect";
import { agent, getArgs, phase } from "@t3team/sdk";

export const Inputs = Schema.Struct({});

export const Outputs = Schema.Struct({
  first: Schema.String,
  second: Schema.String,
});

export const meta = {
  name: "example.phase-stamp",
  description: "Two phases, one agent turn each.",
  inputs: Inputs,
  outputs: Outputs,
  phases: [{ title: "Phase One" }, { title: "Phase Two" }],
} as const;

export default async function run() {
  getArgs();

  phase("Phase One");
  const first = await agent("First turn", { capabilities: "inherit" });

  phase("Phase Two");
  const second = await agent("Second turn", { capabilities: "inherit" });

  return { first, second };
}
