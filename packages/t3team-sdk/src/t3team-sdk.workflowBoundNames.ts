/**
 * The names a workflow body can actually resolve at runtime — DERIVED from the surface the loader
 * binds, never a hand-kept list.
 *
 * Incident (nexi #339 follow-up): an author imported a name from `@t3team/sdk` that the engine did
 * not bind. The loader erases imports (`@runbook/ts` `collectBlankSpans`), so the import "worked"
 * statically and the body died with a `ReferenceError` at its first call. The static bindings audit
 * ({@link ./t3team-sdk.bindingScan.ts}) and the generated author reference both read THIS list, so
 * a name is teachable exactly when it is bound.
 *
 * `buildWorkflowGlobals` only assembles an object from its inputs; the inert stand-ins below are
 * never invoked. Keep this module free of any other export so importing it has no side effects
 * beyond the one object assembly.
 */

import { hostSource } from "@runbook/ts/globals";
import type { CheckpointPrimitives } from "@runbook/core/checkpoint";

import type { WorkflowPrimitives } from "./t3team-sdk.primitives.ts";
import type { SchedulePrimitives } from "./t3team-sdk.schedulePrimitive.ts";
import type { SignalPrimitives } from "./t3team-sdk.signalPrimitive.ts";
import type { WorkflowThreadPrimitives } from "./t3team-sdk.threadPrimitives.ts";
import { buildWorkflowGlobals } from "./t3team-sdk.workflowGlobals.ts";

const inert = (): never => {
  throw new Error("WORKFLOW_BOUND_GLOBAL_NAMES stand-in was invoked; it only exists to be keyed.");
};

const INERT_PRIMITIVES = new Proxy({}, { get: () => inert }) as unknown as WorkflowPrimitives;

/** Every identifier the body context binds, in binding order. */
export const WORKFLOW_BOUND_GLOBAL_NAMES: ReadonlyArray<string> = Object.freeze(
  Object.keys(
    buildWorkflowGlobals({
      args: undefined,
      tools: {},
      scripts: {},
      runtime: hostSource(),
      primitives: INERT_PRIMITIVES,
      checkpoint: inert as unknown as CheckpointPrimitives["checkpoint"],
      threads: {
        thread: undefined,
        spawnThread: inert,
        agent: inert,
      } as unknown as WorkflowThreadPrimitives,
      schedule: { waitUntil: inert } as unknown as SchedulePrimitives,
      signals: { getSignalSource: inert } as unknown as SignalPrimitives,
    }),
  ),
);

export const WORKFLOW_BOUND_GLOBAL_NAME_SET: ReadonlySet<string> = new Set(
  WORKFLOW_BOUND_GLOBAL_NAMES,
);
