// Exercises the `run(ctx)` seam (@runbook/core/authoring's `RunbookContext`): a body that
// declares the extra context parameter and calls a tool through `ctx.tool(name, args)`
// instead of the `tools.*` tree. Same `demo.approve` tool the journal fixtures use, so the
// same capability gate and journal shape apply.
import { Schema } from "effect";
import { getArgs } from "@t3team/sdk";

export const Inputs = Schema.Struct({
  prId: Schema.String,
});

export const Outputs = Schema.Struct({
  approved: Schema.Boolean,
});

export const meta = {
  name: "fixtures.ctx-tool",
  description: "Calls a tool through ctx.tool(...) instead of the tools.* tree.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["demo.read"],
} as const;

export default async function run(ctx: { tool<T>(name: string, args?: unknown): Promise<T> }) {
  const input = Schema.decodeSync(Inputs)(getArgs());
  const result = await ctx.tool<{ approved: boolean; approvalId: string }>("demo.approve", {
    prId: input.prId,
  });
  return { approved: result.approved };
}
