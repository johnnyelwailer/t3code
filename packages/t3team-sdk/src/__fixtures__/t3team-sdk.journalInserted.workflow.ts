// Drift fixture: identical to journal-two-tools, but with a `tools.demo.lint` call
// inserted before `approve`. Resuming a run journaled from the two-tools workflow with
// this body shifts every call's seq, so seq 1 (recorded as `demo.approve`) is now
// `demo.lint` — a call-identity ReplayDriftError. This is the "inserting a primitive
// between two existing ones is a version-incompatible change" rule from Epic 25.
import { Schema } from "effect";
import { getArgs, getTools, log, phase } from "@t3team/sdk";

export const Inputs = Schema.Struct({
  prId: Schema.String,
});

export const Outputs = Schema.Struct({
  approved: Schema.Boolean,
  mergedSha: Schema.String,
});

export const meta = {
  name: "fixtures.journal-inserted",
  description: "Two-tools workflow with a lint call inserted at the front (drift fixture).",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["demo.read"], // tool-group gate: the demo tools' group (Epic 25 §Tools)
} as const;

export default async function run() {
  const args = getArgs();
  const tools = getTools();

  const input = Schema.decodeSync(Inputs)(args);

  phase("Lint");
  const lint = await tools.demo.lint({ prId: input.prId });
  log(`lint score ${lint.score}`);

  phase("Approve");
  const approval = await tools.demo.approve({ prId: input.prId });

  phase("Merge");
  const merge = await tools.demo.merge({ prId: input.prId, approvalId: approval.approvalId });

  return { approved: approval.approved, mergedSha: merge.sha };
}
