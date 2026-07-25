// Capability-gate fixture (Epic 25 §Capability gating): declares the demo tools' group as an
// inline ToolGroupRef-shaped literal (typed imports are blanked by the meta-head vm, so an
// inline literal — or the plain group-id string — is how a group declaration survives static
// meta extraction) and calls a tool of that group.
import { Schema } from "effect";

const demoRead = {
  kind: "tool-group",
  id: "demo.read",
  label: "Demo tools",
  description: "Tools used by the durable-engine test suite.",
} as const;

export const Inputs = Schema.Struct({
  prId: Schema.String,
});

export const Outputs = Schema.Struct({
  approved: Schema.Boolean,
});

export const meta = {
  name: "fixtures.tool-group-object-cap",
  description: "Declares the demo group as an inline ToolGroupRef literal.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: [demoRead],
} as const;

const input = Schema.decodeSync(Inputs)(args);

const approval = await tools.demo.approve({ prId: input.prId });

return { approved: approval.approved };
