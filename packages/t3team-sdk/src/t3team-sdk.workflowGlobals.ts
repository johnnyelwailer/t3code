/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * The global environment a workflow body (and the meta-extraction head) sees in its
 * `vm.Script` context.
 *
 * Stage-1 has NO sandbox — the body runs in a vm context whose host realm is reachable via
 * prototype chains (trust model: "trusted project code"). What this module provides is
 * *determinism*: `Date`, `Math.random`, and `crypto.randomUUID` are overridden so each call
 * routes through the journal and replays the recorded value. The host `Error` intrinsics
 * are injected so `instanceof Error` holds for engine-thrown errors. Stage-2 (planned: SES
 * or isolated-vm) is the real sandbox if/when untrusted workflows are in scope.
 */

import * as Schema from "effect/Schema";

import { deterministicGlobals, hostSource, type DeterministicSource } from "@runbook/ts/globals";

import {
  CancelledError,
  PermissionDeniedError,
  ProviderUnavailableError,
  ReplayDriftError,
  SchemaExhaustedError,
  TargetMissingError,
  TimeoutError,
  WorkflowError,
} from "./t3team-sdk.errors.ts";
import type { WorkflowPrimitives } from "./t3team-sdk.primitives.ts";
import type { SchedulePrimitives } from "./t3team-sdk.schedulePrimitive.ts";
import type { WorkflowThreadPrimitives } from "./t3team-sdk.threadPrimitives.ts";
import { defineWorkflow } from "./t3team-sdk.ts";

export {
  deterministicGlobals,
  hostErrorGlobals,
  hostSource,
  makeJournaledCrypto,
  makeJournaledDate,
  makeJournaledMath,
} from "@runbook/ts/globals";
export type { DeterministicSource } from "@runbook/ts/globals";

/**
 * Assemble the engine surface the loader binds into the body context: `args`, `Schema`, the
 * `tools.*`/`scripts.*` trees, the composition primitive set (`parallel`/`pipeline`/
 * `workflow`/`wait`/`budget`/`phase`/`log`), the Thread-model globals (`thread`/`spawnThread`/
 * `agent`), the deterministic globals, and the catchable error-class globals (Epic 25 §Error
 * classes — the full taxonomy is bindable even though only a subset is raised so far).
 */
export function buildWorkflowGlobals(opts: {
  readonly args: unknown;
  readonly tools: Record<string, unknown>;
  readonly scripts: Record<string, unknown>;
  readonly runtime: DeterministicSource;
  readonly primitives: WorkflowPrimitives;
  readonly threads: WorkflowThreadPrimitives;
  readonly schedule: SchedulePrimitives;
}): Record<string, unknown> {
  const p = opts.primitives;
  const t = opts.threads;
  return {
    ...deterministicGlobals(opts.runtime),
    args: opts.args,
    Schema,
    tools: opts.tools,
    scripts: opts.scripts,
    parallel: p.parallel,
    pipeline: p.pipeline,
    workflow: p.workflow,
    wait: p.wait,
    budget: p.budget,
    phase: p.phase,
    log: p.log,
    // `now()` is the journaled wall clock (same source the deterministic `Date` reads): a
    // resume replays the recorded value, so time helpers built on it (and `waitUntil(now() +
    // ms)`) are replay-deterministic (Epic 27 §Time & scheduling helpers).
    now: opts.runtime.now,
    // The Thread model (Epic 25 §The thread model): `thread` is the launching chat (undefined
    // if headless); `spawnThread` makes an isolated thread; `agent` is the one-shot shortcut
    // for `spawnThread().askAgent()`. `askUser`/`notifyUser` are capability-gated per call.
    thread: t.thread,
    spawnThread: t.spawnThread,
    agent: t.agent,
    // `waitUntil` (Epic 27) suspends until a wall-clock instant; gated by the `"schedule"`
    // capability (calling it without that capability throws PermissionDeniedError).
    waitUntil: opts.schedule.waitUntil,
    // The accessor form of the per-run VALUES above (Epic 25 §The engine API). A body that does
    // `import { getArgs } from "@t3team/sdk"` has that import blanked by the loader, so the call
    // has to resolve to something in this surface — these five are it. They read the same values
    // bound above, so the accessor and the bare identifier can never disagree.
    getArgs: () => opts.args,
    getThread: () => t.thread,
    getBudget: () => p.budget,
    getScripts: () => opts.scripts,
    getTools: () => opts.tools,
    // `defineWorkflow` lets a body construct the typed sub-workflow ref `workflow()` needs;
    // it is a pure ref constructor (no capability concern), so it is unconditionally bound.
    defineWorkflow,
    WorkflowError,
    TimeoutError,
    SchemaExhaustedError,
    ProviderUnavailableError,
    PermissionDeniedError,
    TargetMissingError,
    CancelledError,
    ReplayDriftError,
  };
}
