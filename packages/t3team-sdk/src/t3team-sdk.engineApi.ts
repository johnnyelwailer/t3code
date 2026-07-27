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

import type * as Schema from "effect/Schema";

import { bodyApiStorage } from "./t3team-sdk.internal.ts";

/** Reads one member of the active body surface, or explains precisely why it is unavailable. */
function fromRun<T>(name: string): T {
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
 * Signatures carry the schema through, which is the whole point of imports over globals: with
 * `{ schema }` the result is the decoded `T`, without it a string. A body that reads
 * `result.someField` now fails to compile when the schema has no such field, instead of surfacing as
 * `unknown` at every use site.
 */
export function agent<T>(
  prompt: string,
  opts: { readonly schema: Schema.Schema<T> } & Record<string, unknown>,
): Promise<T>;
export function agent(prompt: string, opts?: Record<string, unknown>): Promise<string>;
export function agent(prompt: string, opts?: Record<string, unknown>): Promise<unknown> {
  return fromRun<(p: string, o?: Record<string, unknown>) => Promise<unknown>>("agent")(prompt, opts);
}

export const spawnThread = call<[Record<string, unknown>?], unknown>("spawnThread");

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
export const workflow = call<[unknown, unknown?], Promise<unknown>>("workflow");

// --- Progress and control ----------------------------------------------------
export const phase = call<[string], void>("phase");
export const log = call<[string], void>("log");
export const wait = call<ReadonlyArray<unknown>, Promise<unknown>>("wait");
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
 */
export function getThread<T = unknown>(): T | undefined {
  const surface = bodyApiStorage.getStore();
  if (surface === undefined) {
    throw new Error(
      "'getThread' was called outside a workflow runtime. Engine APIs only resolve while an orchestration body is running.",
    );
  }
  return surface.thread as T | undefined;
}

export function getBudget<T = unknown>(): T {
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
