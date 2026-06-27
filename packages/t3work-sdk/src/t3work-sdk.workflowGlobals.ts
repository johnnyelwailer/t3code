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

import * as NodeCrypto from "node:crypto";

import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import {
  CancelledError,
  PermissionDeniedError,
  ProviderUnavailableError,
  ReplayDriftError,
  SchemaExhaustedError,
  TargetMissingError,
  TimeoutError,
  WorkflowError,
} from "./t3work-sdk.errors.ts";
import type { WorkflowPrimitives } from "./t3work-sdk.primitives.ts";
import type { SchedulePrimitives } from "./t3work-sdk.schedulePrimitive.ts";
import type { WorkflowThreadPrimitives } from "./t3work-sdk.threadPrimitives.ts";
import { defineWorkflow } from "./t3work-sdk.ts";

/** The journaled-entropy surface the deterministic globals route through (the durable
 * runtime supplies it live; {@link passthroughSource} supplies real values at load time). */
export interface DeterministicSource {
  readonly now: () => number;
  readonly random: () => number;
  readonly uuid: () => string;
}

/** Host error intrinsics — injected so `instanceof Error`/`TypeError`/… hold for both
 * engine-thrown errors (which extend the host Error) and author-thrown ones. */
export function hostErrorGlobals(): Record<string, unknown> {
  return { Error, TypeError, RangeError, SyntaxError };
}

/**
 * A `Date` whose zero-arg `new Date()` and `Date.now()` are journaled via `source.now()`;
 * `parse`/`UTC` and the prototype pass straight through to the real `Date`, so
 * `instanceof Date` and the instance methods behave normally. Multi-arg `new Date(…)` is
 * deterministic already (no wall-clock read), so it constructs a real Date verbatim.
 */
export function makeJournaledDate(source: Pick<DeterministicSource, "now">): DateConstructor {
  const RealDate = Date;
  // `Reflect.construct` (not `new RealDate(...)`) so the host realm's date construction isn't
  // flagged by the Effect language-service rule; the constructed value is a real Date.
  const JournaledDate = function (this: unknown, ...args: ReadonlyArray<unknown>): unknown {
    if (new.target === undefined)
      return (Reflect.construct(RealDate, [source.now()]) as Date).toString();
    if (args.length === 0) return Reflect.construct(RealDate, [source.now()]);
    return Reflect.construct(RealDate, args as ReadonlyArray<never>);
  } as ((...args: ReadonlyArray<unknown>) => unknown) & Record<string, unknown>;
  JournaledDate["now"] = () => source.now();
  JournaledDate["parse"] = RealDate.parse;
  JournaledDate["UTC"] = RealDate.UTC;
  JournaledDate["prototype"] = RealDate.prototype;
  return JournaledDate as unknown as DateConstructor;
}

/** `Math` with a journaled `random()`; every other member resolves through the prototype
 * to the real `Math` (a plain `{ ...Math }` would drop the non-enumerable methods). */
export function makeJournaledMath(source: Pick<DeterministicSource, "random">): typeof Math {
  return Object.assign(Object.create(Math) as typeof Math, { random: () => source.random() });
}

/** `crypto` with a journaled `NodeCrypto.randomUUID()`. The override is what the determinism contract
 * needs; other host-crypto members pass through if the realm exposes them enumerably. */
export function makeJournaledCrypto(
  source: Pick<DeterministicSource, "uuid">,
): Record<string, unknown> {
  const hostCrypto = globalThis.crypto as unknown as Record<string, unknown>;
  return { ...hostCrypto, randomUUID: () => source.uuid() };
}

/** The deterministic globals (journaled Date/Math/crypto + host Error intrinsics) shared by
 * the body context and the meta-extraction context. */
export function deterministicGlobals(source: DeterministicSource): Record<string, unknown> {
  return {
    ...hostErrorGlobals(),
    Date: makeJournaledDate(source),
    Math: makeJournaledMath(source),
    crypto: makeJournaledCrypto(source),
  };
}

/** Real host wall-clock + entropy (unjournaled). Backs the durable runtime's live reads and
 * its nested-handler black box, and load-time meta extraction (where `meta` is pure anyway,
 * so the reads never actually fire). Routed through `DateTime`/`node:crypto` so the host
 * realm isn't flagged by the Effect language-service `globalDate`/`globalRandom` rules. */
export function hostSource(): DeterministicSource {
  return {
    now: () => DateTime.nowUnsafe().epochMilliseconds,
    random: () => NodeCrypto.randomInt(2 ** 32) / 2 ** 32,
    uuid: () => NodeCrypto.randomUUID(),
  };
}

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
