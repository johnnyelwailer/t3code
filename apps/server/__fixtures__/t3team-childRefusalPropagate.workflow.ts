// A workflow whose only step is a one-shot agent. When the host refuses to create the child,
// the refusal must FAIL THE RUN: the author's `agent()` is the awaited half of the spawn, so the
// host's own error has to reach the body through the durable engine — not vanish into the
// one-way create that fired it.
import { agent } from "@t3team/sdk";

export const meta = {
  name: "test.child-refusal-propagate",
  description: "Spawns one agent; a child the host refuses fails the run.",
} as const;

export default async function run() {
  const answer = await agent("Review the risk", {
    label: "Risk review",
    capabilities: "inherit",
  });
  return { answer };
}
