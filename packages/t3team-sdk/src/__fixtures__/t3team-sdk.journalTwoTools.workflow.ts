// Worked example for the Epic 25.2 durable engine: a two-step workflow that approves a
// PR and then merges it. Each `tools.*` call is a journaled checkpoint, so on resume the
// approve result replays from the journal and only the merge re-executes (or, if the args
// diverge, the engine raises ReplayDriftError). Run it via startWorkflow / resumeWorkflow.
import { Schema } from "effect";

export const Inputs = Schema.Struct({
  prId: Schema.String,
});

export const Outputs = Schema.Struct({
  approved: Schema.Boolean,
  mergedSha: Schema.String,
});

export const meta = {
  name: "fixtures.journal-two-tools",
  description: "Approve a PR then merge it — exercises journal + replay end to end.",
  inputs: Inputs,
  outputs: Outputs,
  phases: [{ title: "Approve" }, { title: "Merge" }],
} as const;

const input = Schema.decodeSync(Inputs)(args);

phase("Approve");
const approval = await tools.demo.approve({ prId: input.prId });

phase("Merge");
const merge = await tools.demo.merge({ prId: input.prId, approvalId: approval.approvalId });

log(`merged ${input.prId} as ${merge.sha}`);

return { approved: approval.approved, mergedSha: merge.sha };
