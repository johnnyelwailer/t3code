// End-to-end fixture (Epic 25 acceptance): exercises the whole Thread model in one body —
//   1. `agent(prompt, { schema })`        — a schema-typed turn in a fresh isolated thread,
//   2. `thread.askAgent(prompt, { schema })` — a schema-typed turn in the launching thread,
//   3. `thread.askUser(question, { schema })`— a typed user escalation in the launching thread.
// Each ask suspends; a test orchestration harness drives suspend → resume by appending the
// resolved reply and calling resumeWorkflow, the same loop the production reactor runs.
import { Schema } from "effect";

export const Inputs = Schema.Struct({ change: Schema.String });

export const Outputs = Schema.Struct({
  risk: Schema.String,
  plan: Schema.String,
  approved: Schema.Boolean,
});

export const meta = {
  name: "fixtures.e2e-review",
  description: "Classify risk in an isolated thread, plan + escalate in the launching thread.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;

const input = Schema.decodeSync(Inputs)(args);

if (thread === undefined) throw new Error("fixtures.e2e-review requires a launching thread");

const Risk = Schema.Struct({ risk: Schema.String });
const classified = await agent(`classify the risk of: ${input.change}`, { schema: Risk });

const Plan = Schema.Struct({ plan: Schema.String });
const planned = await thread.askAgent(`draft a rollout plan for a ${classified.risk}-risk change`, {
  schema: Plan,
});

const Decision = Schema.Struct({ approved: Schema.Boolean });
const decision = await thread.askUser(`Approve this plan?\n\n${planned.plan}`, {
  schema: Decision,
});

return { risk: classified.risk, plan: planned.plan, approved: decision.approved };
