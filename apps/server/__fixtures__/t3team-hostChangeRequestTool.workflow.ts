// Host-tool fixture: a body that DECLARES `mutation.change_request` and publishes through the
// broker's change-request tool. Proves the call path a recipe uses — the SDK camelCases each id
// segment, so `t3team.change_request.publish` is `t3team.changeRequest.publish` in `getTools()`.
import { Schema } from "effect";
import { getArgs, getTools } from "@t3team/sdk";

export const Inputs = Schema.Struct({ branch: Schema.String, paths: Schema.Array(Schema.String) });

export const meta = {
  name: "fixtures.host-change-request-tool",
  description: "Publishes listed files as a change request through the host broker.",
  inputs: Inputs,
  capabilities: ["mutation.change_request"],
} as const;

export default async function run() {
  const input = Schema.decodeSync(Inputs)(getArgs());

  const published = await getTools().t3team.changeRequest.publish({
    branch: input.branch,
    paths: input.paths,
    commitMessage: "chore: add machine setup",
    title: "Add machine setup",
    body: "Adds the dev container.",
  });

  return { published };
}
