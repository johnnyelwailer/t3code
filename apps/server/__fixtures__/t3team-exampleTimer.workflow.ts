// Example scheduled-workflow recipe (Epic 27 acceptance proof): a real `.workflow.ts` that
// parks on the clock. It computes a deadline from the journaled `now()`, sleeps until it via
// `waitUntil` (the `"schedule"` capability gates that primitive), then completes — exercising
// the timer→suspend→restart→wake→resume loop the scheduler drives.
import { Schema } from "effect";

export const Inputs = Schema.Struct({ delayMs: Schema.Number });

export const Outputs = Schema.Struct({
  slept: Schema.Boolean,
  /** The absolute deadline the run parked on, echoed back so a test can assert determinism
   * (the resumed body re-reads the journaled `now()`, so this matches the recorded `wake_at`). */
  deadline: Schema.Number,
});

export const meta = {
  name: "example.timer",
  description: "Sleep until a deadline computed from the journaled clock, then complete.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["schedule"],
} as const;

const input = Schema.decodeSync(Inputs)(args);

// `now()` is the journaled clock — recorded on first execution, replayed on resume — so the
// deadline is deterministic across the restart the scheduler resumes through.
const deadline = now() + input.delayMs;
await waitUntil(deadline);

return { slept: true, deadline };
