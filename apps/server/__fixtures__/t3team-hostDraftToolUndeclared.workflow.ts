// Negative twin of t3team-hostDraftTool.workflow.ts: the SAME call with NO `mutation.draft` in
// meta.capabilities. The SDK's call-site gate (`assertToolGroupDeclared`) must refuse it, so
// exposing host tools to bodies cannot become an implicit grant.
import { Schema } from "effect";
import { getArgs, getTools } from "@t3team/sdk";

export const Inputs = Schema.Struct({ issueIdOrKey: Schema.String, body: Schema.String });

export const meta = {
  name: "fixtures.host-draft-tool-undeclared",
  description: "Calls the work-item draft tool without declaring the draft capability.",
  inputs: Inputs,
  capabilities: [],
} as const;

export default async function run() {
  const input = Schema.decodeSync(Inputs)(getArgs());

  return await getTools().t3team.workItem.description.draftUpdate({
    issue_id: input.issueIdOrKey,
    body: input.body,
  });
}
