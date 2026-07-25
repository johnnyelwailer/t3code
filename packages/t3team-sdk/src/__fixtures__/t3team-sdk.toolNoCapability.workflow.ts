// Capability-gate fixture (Epic 25 §Tools): calls `tools.demo.approve` WITHOUT declaring the
// demo tools' group in meta.capabilities, so the call site throws PermissionDeniedError —
// even when the run options register the tool.
import { Schema } from "effect";

export const Inputs = Schema.Struct({
  prId: Schema.String,
});

export const Outputs = Schema.Struct({
  approved: Schema.Boolean,
});

export const meta = {
  name: "fixtures.tool-no-capability",
  description: "Calls tools.demo.approve without the 'demo.read' tool-group capability.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

const input = Schema.decodeSync(Inputs)(args);

const approval = await tools.demo.approve({ prId: input.prId });

return { approved: approval.approved };
