// Bounded-execution e2e body (docs/runbook/bounded-execution.md): K agent iterations, a
// checkpoint after each. On a checkpoint-window resume, `getResume()` carries the compact
// state, so the loop CONTINUES from the boundary instead of re-running the superseded prefix.
// The journaled agent steps replay their recorded answers — the Nexplore provider is NOT
// re-invoked for them.
import { Schema } from "effect";

import { agent, checkpoint, getArgs, getResume } from "@t3team/sdk";

export const Inputs = Schema.Struct({ k: Schema.Number });

export const Outputs = Schema.Struct({
  i: Schema.Number,
  total: Schema.Number,
});

export const meta = {
  name: "e2e.bounded-loop",
  description:
    "K Nexplore agent steps with a checkpoint after each; a resume continues from the boundary.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

export default async function run() {
  const { k } = getArgs();

  // Restore the compact state a checkpoint-window resume restored (absent on a fresh start).
  const resumed = getResume();
  const compact =
    resumed !== undefined
      ? (resumed.state as { readonly i: number; readonly total: number })
      : { i: 0, total: 0 };
  let state = { i: compact.i, total: compact.total };

  for (let i = state.i; i < k; i++) {
    const answer = await agent(`Reply with just the number one greater than ${i}.`, {
      capabilities: "inherit",
    });
    const value = Number.parseInt(answer.trim(), 10);
    if (!Number.isInteger(value)) {
      throw new Error(`agent step ${i} answered '${answer}' — expected a number`);
    }
    state = { i: i + 1, total: state.total + value };
    // The primitive's contract is `CheckpointInput = { state, retention? }`; pass the compact
    // state wrapped, so the journaled record carries `state` (not the raw object's keys).
    await checkpoint({ state });
  }

  return state;
}
