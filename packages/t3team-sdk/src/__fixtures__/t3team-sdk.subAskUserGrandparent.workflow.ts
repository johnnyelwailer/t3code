// Three levels deep on purpose: grandparent -> parent -> child, where the CHILD asks the user.
//
// This is the composition the one-level cap made impossible, and the one that proves sub-workflows
// are first class: the question is raised two levels down, it reaches the launching thread anyway,
// and the run suspends durably on it instead of holding the answer in memory.
import { Schema } from "effect";
import { defineWorkflow, workflow } from "@t3team/sdk";

import type * as Middle from "./t3team-sdk.subAskUserParent.workflow.ts";

export const Outputs = Schema.Struct({ answer: Schema.String });

export const meta = {
  name: "fixtures.sub-ask-user-grandparent",
  description: "Runs a sub-workflow that itself runs a sub-workflow which escalates to the user.",
  outputs: Outputs,
  capabilities: ["user"],
} as const;

export default async function run() {
  const middle = defineWorkflow<typeof Middle>("./t3team-sdk.subAskUserParent.workflow.ts");
  const result = await workflow(middle, { subject: "the deployment" });
  return { answer: result.answer };
}
