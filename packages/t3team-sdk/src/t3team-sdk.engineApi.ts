/**
 * The engine API as ORDINARY IMPORTS (Epic 25 §The engine API — imported, not injected).
 *
 * An orchestration body is a normal TypeScript module: it imports `agent`, `phase`, `parallel`, … from
 * `@t3team/sdk` instead of relying on identifiers the engine injects into its scope. That is what
 * makes a body typecheck, navigable in an editor, and analysable by binding rather than by bare name.
 *
 * Mechanism: exactly the one `defineTool` handlers already use. The runner binds the run's surface
 * into an `AsyncLocalStorage` (`bodyApiStorage`) and each export below reads it. Calling one outside a
 * run throws the same shape of error a tool handler does, rather than returning undefined and failing
 * later somewhere unrelated.
 *
 * Failures are synchronous even for the async verbs: calling an engine verb outside a run is a
 * programming error, so it throws at the call site with a clean stack rather than becoming a rejected
 * promise someone has to trace back to its origin.
 *
 * Per-run VALUES are accessors (`getArgs`, `getThread`, `getBudget`, `getScripts`, `getTools`): a
 * module-level import cannot be a per-run binding, and an accessor keeps the run boundary explicit.
 */

import type { WorkflowBudget } from "./t3team-sdk.primitiveTypes.ts";
import { bodyApiStorage } from "./t3team-sdk.internal.ts";
import type { AgentOpts, SpawnThreadOpts, Thread } from "./t3team-sdk.threadTypes.ts";
import type { WorkflowInvokeOpts, WorkflowRef } from "./t3team-sdk.types.ts";

/** Reads one member of the active body surface, or explains precisely why it is unavailable. */
export function fromRun<T>(name: string): T {
  const surface = bodyApiStorage.getStore();
  if (surface === undefined) {
    throw new Error(
      `'${name}' was called outside a workflow runtime. Engine APIs only resolve while an orchestration body is running.`,
    );
  }
  const member = surface[name];
  if (member === undefined) {
    throw new Error(
      `'${name}' is not available in this run. It is capability-gated — declare the matching capability in \`meta.capabilities\`.`,
    );
  }
  return member as T;
}

const call =
  <A extends ReadonlyArray<unknown>, R>(name: string) =>
  (...args: A): R =>
    fromRun<(...a: A) => R>(name)(...args);

// --- Orchestration -----------------------------------------------------------
/**
 * A one-shot subagent: `spawnThread(opts).askAgent(prompt, opts)`, thread not retained.
 *
 * The options are a DECLARED type ({@link AgentOpts}), not an `unknown` bag. That is the whole point
 * of imports over globals: a misspelled key, a wrong value shape, or a missing required field is a
 * compile error at the call site instead of a value the runtime silently drops. `R` is inferred from
 * `schema` — with one, the result is the decoded value and `result.someField` fails to compile when
 * the schema has no such field; without one, it is a `string`.
 *
 * `capabilities` is required, so `opts` is required. See {@link AgentOpts}.
 */
export function agent<R = string>(prompt: string, opts: AgentOpts<R>): Promise<R> {
  return fromRun<(p: string, o: AgentOpts<R>) => Promise<R>>("agent")(prompt, opts);
}

/** A new isolated thread the body can drive over several turns. `capabilities` is required, so
 * `opts` is required — an unnamed, unscoped child was never a deliberate choice. */
export function spawnThread(opts: SpawnThreadOpts): Thread {
  return fromRun<(o: SpawnThreadOpts) => Thread>("spawnThread")(opts);
}

/**
 * Tuple-preserving, so `const [a, b] = await parallel([…])` keeps each thunk's own type instead of
 * collapsing to a union. `null` is in the element type because a failing thunk resolves to null
 * rather than rejecting the whole fanout.
 */
export function parallel<const T extends ReadonlyArray<() => unknown>>(
  thunks: T,
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> | null }> {
  return fromRun<(t: T) => Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> | null }>>(
    "parallel",
  )(thunks);
}

export const pipeline = call<ReadonlyArray<unknown>, Promise<unknown[]>>("pipeline");

/**
 * Run another orchestration inline as one sub-step. The typed `WorkflowRef` from `defineWorkflow`
 * carries the child's `Inputs`/`Outputs`, so `args` is checked and the result is the child's own
 * output type rather than `unknown` (spec §The engine API: `ref` must be a typed `WorkflowRef`).
 *
 * `opts.handlers`, if given, lets THIS call answer some of the child's effects itself instead of
 * handing it the run's real broker unconditionally — e.g. a deterministic `thread.turn` result for
 * sub-workflow testing, or a scripted `user.input` reply. Unlisted `HandleKind`s (and every call
 * that omits `opts` entirely) reach the real host exactly as before this parameter existed; there
 * is no per-ask opt-out, only this per-invocation opt-in (see `InterceptHandler` in
 * `t3team-sdk.broker.ts` for why).
 */
export function workflow<I, O>(
  ref: WorkflowRef<I, O>,
  args?: I,
  opts?: WorkflowInvokeOpts,
): Promise<O> {
  return fromRun<(r: WorkflowRef<I, O>, a?: I, o?: WorkflowInvokeOpts) => Promise<O>>("workflow")(
    ref,
    args,
    opts,
  );
}

// --- Progress and control ----------------------------------------------------
export const phase = call<[string], void>("phase");
export const log = call<[string], void>("log");
/** Durable timer: suspends the run if the deadline has not passed, and survives a restart. */
export const wait = call<[number], Promise<void>>("wait");
export const waitUntil = call<[number], Promise<void>>("waitUntil");

/** The journaled wall clock: a resume replays the recorded value, so it stays replay-deterministic. */
export const now = call<[], number>("now");

// --- Per-run values ----------------------------------------------------------
/** Validated against `meta.inputs` before the body runs. */
export function getArgs<T = unknown>(): T {
  return fromRun<T>("args");
}

/**
 * The chat the run was launched from, or `undefined` when headless (cron/automation) — so this is the
 * one accessor that legitimately returns undefined rather than throwing.
 *
 * Defaults to the real {@link Thread}, so `getThread()?.askUser(…)` typechecks and a misspelled verb
 * or a wrong option shape is caught here. It stayed `unknown` far too long, which is why every thread
 * verb reached through it was effectively untyped no matter how well `Thread` itself was declared.
 */
export function getThread<T = Thread>(): T | undefined {
  const surface = bodyApiStorage.getStore();
  if (surface === undefined) {
    throw new Error(
      "'getThread' was called outside a workflow runtime. Engine APIs only resolve while an orchestration body is running.",
    );
  }
  return surface.thread as T | undefined;
}

export function getBudget<T = WorkflowBudget>(): T {
  return fromRun<T>("budget");
}

/** Recipe-private scripts; present only when the body declares the `"script"` capability. */
export function getScripts<T = Record<string, unknown>>(): T {
  return fromRun<T>("scripts");
}

/** The resolved tool tree for this run's declared tool groups. */
export function getTools<T = Record<string, unknown>>(): T {
  return fromRun<T>("tools");
}

/** Binds a body surface for the duration of `run`. Called by the engine, not by authors. */
export function withBodyApi<T>(surface: Record<string, unknown>, run: () => T): T {
  return bodyApiStorage.run(surface, run);
}
