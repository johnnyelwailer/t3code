/**
 * `@t3team/sdk/source` — the EFFECTFUL half of the signal-source split.
 *
 * `defineSignalSource` declares a source whose `start` may run effects (network, files,
 * timers, subprocesses) — that is the whole point: producers are code, not engine verbs.
 * The engine verbs (`getSignalSource`, `waitFor`) live in the replayed surface and never
 * touch effects; this entry is where untrusted code goes in, and where `start(ctx)` is
 * executed host-side under the reconciler's supervision.
 *
 * The engine OWNS the instance's lifecycle: `start` is called once per live instance by the
 * reconciler, `stop` is called when the instance is orphaned (no live run holds a
 * registration on it) or on host shutdown. Push-only producers should use
 * `ctx.getCursor`/`ctx.setCursor` (the durable cursor) so a catch-up sweep after a host-down
 * window bridges gaps — a host that is down cannot be bridged any other way.
 *
 * NOTE: params are stored, logged, and hashed — never put secrets in them. Credentials
 * arrive by reference (a project, an account id, a provider ref) and are resolved inside
 * `start`, where the host has the capability to do so.
 */

import * as Schema from "effect/Schema";

import type {
  Signal,
  SignalSourceContext,
  SignalSourceInstance,
  SignalSourceRef,
} from "./t3team-sdk.signal.ts";
import { assertSignalName } from "./t3team-sdk.signal.ts";

/**
 * Declare a source with its `start` behavior. Returns the declaration ref — for
 * AUTHOR-DEFINED sources this is the object a workflow body binds via `getSignalSource`;
 * for BUILT-IN catalog sources the host registers its own `start` under the same `name`
 * instead (see `builtinSignalSource`).
 */
export function defineSignalSource<
  const P,
  Signals extends ReadonlyArray<Signal<unknown>>,
>(opts: {
  readonly name: string;
  readonly params: P;
  readonly emits: Signals;
  readonly start: (
    ctx: SignalSourceContext<Schema.Schema.Type<P>>,
  ) => Promise<SignalSourceInstance> | SignalSourceInstance;
}): SignalSourceRef<Schema.Schema.Type<P>, Signals, P> {
  assertSignalName(opts.name);
  return Object.freeze({
    kind: "signalSource",
    name: opts.name,
    params: opts.params,
    emits: opts.emits,
    start: async (ctx: SignalSourceContext<Schema.Schema.Type<P>>) => {
      return await opts.start(ctx);
    },
  });
}
