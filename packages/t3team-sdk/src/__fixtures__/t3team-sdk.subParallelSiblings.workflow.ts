// Runs the SAME sub-workflow twice, concurrently, from two `parallel` thunks.
//
// This is a legal composition — "run this analysis over both inputs at once" — and an earlier
// revision of the cycle guard refused it. That guard kept one push/pop stack shared by the whole
// run, so the second thunk saw the first thunk's still-unpopped entry and reported recursion. The
// two calls are siblings, not a chain; a shared stack cannot tell those apart.
import { Schema } from "effect";
import { defineWorkflow, parallel, workflow } from "@t3team/sdk";

import type * as Child from "./t3team-sdk.subChild.workflow.ts";

export const Outputs = Schema.Struct({
  first: Schema.String,
  second: Schema.String,
});

export const meta = {
  name: "fixtures.sub-parallel-siblings",
  description: "Invokes one sub-workflow twice concurrently from parallel thunks.",
  outputs: Outputs,
  capabilities: ["script"],
} as const;

export default async function run() {
  const child = defineWorkflow<typeof Child>("./t3team-sdk.subChild.workflow.ts");
  const [first, second] = await parallel([
    () => workflow(child, { name: "eins" }),
    () => workflow(child, { name: "zwei" }),
  ]);
  return { first: first?.greeting ?? "", second: second?.greeting ?? "" };
}
