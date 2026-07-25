// Nested-capability violation fixture (Epic 25 §Capability gating): this parent declares NO
// capabilities but invokes the sub-child workflow, which declares ["script"]. A nested
// workflow may declare a subset of the parent's capabilities but never a superset, so the
// `workflow()` invocation must fail with PermissionDeniedError.
import type * as Child from "./t3team-sdk.subChild.workflow.ts";
import { Schema } from "effect";

export const Inputs = Schema.Struct({ name: Schema.String });

export const Outputs = Schema.Struct({ greeting: Schema.String });

export const meta = {
  name: "fixtures.sub-parent-no-caps",
  description: "Invokes a script-capable child without holding 'script' itself.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

const input = Schema.decodeSync(Inputs)(args);

const child = defineWorkflow<typeof Child>("./t3team-sdk.subChild.workflow.ts");
const sub = await workflow(child, { name: input.name });

return { greeting: sub.greeting };
