// The relative-timer sibling of t3team-exampleTimer.workflow.ts: `wait(ms)` under the
// `"schedule"` capability must take the same clock park as `waitUntil` — `sleeping` + `wake_at`,
// woken by the scheduler after a restart — rather than an in-process timer a restart fails.
import { Schema } from "effect";
import { getArgs, wait } from "@t3team/sdk";

export const Inputs = Schema.Struct({ delayMs: Schema.Number });

export const Outputs = Schema.Struct({ slept: Schema.Boolean });

export const meta = {
  name: "example.wait-timer",
  description: "Wait a relative duration on the durable clock, then complete.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["schedule"],
} as const;

export default async function run() {
  const input = Schema.decodeSync(Inputs)(getArgs());
  await wait(input.delayMs);
  return { slept: true };
}
