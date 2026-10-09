// launchThread through the production broker and host: launch a PR thread by key, watch its
// pull request, park on an agent() step, then (after the resume replays everything above) launch
// the same key again and write the run's summary fact.
import { Schema } from "effect";
import { agent, launchThread, setRunFacts } from "@t3team/sdk";

export const Outputs = Schema.Struct({
  first: Schema.String,
  second: Schema.String,
  secondCreated: Schema.Boolean,
  watching: Schema.Boolean,
  verdict: Schema.String,
});

export const meta = {
  name: "fixtures.launch-thread",
  description: "Launch a thread by key across a suspension.",
  capabilities: ["launch"],
  outputs: Outputs,
} as const;

export default async function run() {
  const key = "pr:github.com/acme/app#7";
  const t = await launchThread({
    key,
    title: "#7 Fix the thing",
    message: "You watch one PR.",
    runtimeMode: "approval-required",
    workspace: { type: "worktree", baseRef: "fix-thing", branch: "fix-thing" },
  });
  await t.watchPullRequest("https://github.com/acme/app/pull/7");
  const verdict = await agent("Is #7 ready?", { capabilities: "inherit", label: "Judge" });
  const again = await launchThread({ key, title: "ignored" });
  const state = await again.read();
  await setRunFacts({ "acme.summary": { watched: 1 } });
  return {
    first: t.id,
    second: again.id,
    secondCreated: again.created,
    watching: state.pullRequests.some((pr) => pr.number === 7 && pr.watching),
    verdict,
  };
}
