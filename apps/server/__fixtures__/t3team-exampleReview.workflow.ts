// Example recipe action (Epic 25 acceptance proof): a real `.workflow.ts` launched through the
// production path (`launchWorkflowRecipe` → orchestration broker). It reviews a PR in a fresh
// isolated thread, then escalates the merge decision to the user in the launching thread —
// exercising agent(schema) (isolated turn) + thread.askUser(schema) (user escalation) through
// the durable engine's suspend/resume.
import { Schema } from "effect";

export const Inputs = Schema.Struct({ prTitle: Schema.String });

export const Outputs = Schema.Struct({
  summary: Schema.String,
  merged: Schema.Boolean,
});

export const meta = {
  name: "example.pr-review",
  description: "Summarize a PR in an isolated thread, then ask the user whether to merge.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;

const input = Schema.decodeSync(Inputs)(args);

const Summary = Schema.Struct({ summary: Schema.String });
const review = await agent(`Review this pull request and summarize the risk: ${input.prTitle}`, {
  schema: Summary,
});

if (thread === undefined) throw new Error("example.pr-review must run in a launching thread");

const Decision = Schema.Struct({ merge: Schema.Boolean });
const decision = await thread.askUser(`Merge "${input.prTitle}"?\n\n${review.summary}`, {
  schema: Decision,
});

return { summary: review.summary, merged: decision.merge };
