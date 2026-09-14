// Regression fixture: the swallow one level up — a parent that wraps `workflow()` in try/catch.
//
// A sub-workflow runs INLINE in the parent's journal sequence, so the child's suspension travels
// out through the parent's `await workflow(child)` and any catch there absorbs it exactly like a
// catch around `agent()`. The parent must not be able to substitute an assumption for the answer
// the child is still waiting on.
import { Schema } from "effect";
import { defineWorkflow, getArgs, workflow } from "@t3team/sdk";

import type * as Child from "./t3team-sdk.subAskUserChild.workflow.ts";

export const Inputs = Schema.Struct({ subject: Schema.String });

export const Outputs = Schema.Struct({ answer: Schema.String, swallowed: Schema.Boolean });

export const meta = {
  name: "fixtures.suspension-swallow-sub",
  description: "Runs an escalating child sub-workflow and swallows whatever it throws.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;

export default async function run() {
  const input = Schema.decodeSync(Inputs)(getArgs());
  const child = defineWorkflow<typeof Child>("./t3team-sdk.subAskUserChild.workflow.ts");
  try {
    const result = await workflow(child, { subject: input.subject });
    return { answer: result.answer, swallowed: false };
  } catch {
    return { answer: "assumed yes", swallowed: true };
  }
}
