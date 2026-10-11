// launchThread fixture: one top-level thread launched by key, watched, messaged and read; a
// second launch with the same key returns the same thread; a refused configure is caught.
import { Schema } from "effect";
import { launchThread, LaunchedThreadError, setRunFacts } from "@t3team/sdk";

export const Outputs = Schema.Struct({
  id: Schema.String,
  created: Schema.Boolean,
  againId: Schema.String,
  againCreated: Schema.Boolean,
  watching: Schema.Boolean,
  refused: Schema.String,
});

export const meta = {
  name: "fixtures.launch-thread",
  description: "Launches one thread by key and drives it.",
  capabilities: ["launch"],
  outputs: Outputs,
} as const;

export default async function run() {
  const key = "pr:github.com/acme/app#7";
  const t = await launchThread({
    key,
    title: "#7 Fix the thing",
    message: "You watch one PR.",
    workspace: {
      type: "worktree",
      baseRef: "fix-thing",
      branch: "fix-thing",
      startFromOrigin: true,
    },
  });
  await t.watchPullRequest("https://github.com/acme/app/pull/7");
  await t.send("Daily check");
  const again = await launchThread({ key, title: "ignored" });
  const state = await t.read();
  await t.setFacts({ "acme.chip": "own" });
  await setRunFacts({ "acme.summary": { watched: 1 } });
  let refused = "";
  try {
    await t.configure({ runtimeMode: "full-access" });
  } catch (error) {
    refused = error instanceof LaunchedThreadError ? error.message : "other";
  }
  return {
    id: t.id,
    created: t.created,
    againId: again.id,
    againCreated: again.created,
    watching: state.pullRequests[0]?.watching ?? false,
    refused,
  };
}
