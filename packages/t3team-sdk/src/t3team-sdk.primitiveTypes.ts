/**
 * Types for the composition-primitive layer — the token budget surface backing the `budget`
 * global. Kept in its own module so `t3team-sdk.types.ts` (near its additive-guard LOC
 * ceiling) only has to add the run-option fields that reference them.
 *
 * `ModelSelection` now lives in `t3team-sdk.types.ts` (next to `ModelRef`); it is re-exported
 * here for the import sites that still reach for it via this module.
 */

export type { ModelSelection } from "./t3team-sdk.types.ts";

/** The `budget` global: a runtime accumulator over journaled agent-turn token counts. Not
 * journaled itself — reads are deterministic because they sum recorded (or freshly-journaled)
 * entries. Token rollup across thread turns is deferred (Epic 25 §Out of scope), so for now
 * `spent()` is `0` and `remaining()` is `total`. */
export interface WorkflowBudget {
  readonly total: number;
  readonly spent: () => number;
  readonly remaining: () => number;
}
