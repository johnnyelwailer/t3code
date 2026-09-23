/**
 * Signal-source vocabulary (design 42) — the shared contract between a source's producer
 * side and a workflow's consumer side.
 *
 * Three concepts, kept distinct on purpose:
 *   • {@link Signal} — a typed event SHAPE. Declared once, imported by both sides. The schema
 *     is the trust boundary: every delivery is decoded against it, so a producer (including an
 *     untrusted external one) can never inject a shape the consumer is not typed for.
 *   • {@link SignalSourceRef} — an effectful, supervised PRODUCER of one or more signals. The
 *     engine owns its lifetime: nobody in a body calls start/stop, the live set is derived
 *     from journaled registrations and reconciled.
 *   • the CONSUMER — a workflow suspended on a signal via {@link SignalSourceHandle.waitFor}.
 *
 * `(source name, canonical params)` is INSTANCE IDENTITY: three workflows watching the same
 * repo share one running instance; a fourth watching another repo gets its own. Params are
 * stored, logged, and hashed — they must be canonical and must never carry secrets
 * (credentials arrive by reference and are resolved inside `start`).
 *
 * This module is the REPLAYED, effect-free half of the split: it declares signals and source
 * identity. The effectful producer half lives in `@t3team/sdk/source`
 * ({@link import("./t3team-sdk.signalSource.ts").defineSignalSource}).
 */

import * as Schema from "effect/Schema";

import { hashArgs } from "./t3team-sdk.canonicalJson.ts";
import { decodeWithSchema } from "./t3team-sdk.internal.ts";
import { WorkflowError } from "./t3team-sdk.errors.ts";

/** A typed event shape. `name` is a stable dotted identifier (the durable wire key). */
export interface Signal<Payload> {
  readonly kind: "signal";
  readonly name: string;
  /** The payload trust boundary — decoded at every delivery, including untrusted producers. */
  readonly schema: Schema.Schema<Payload>;
}

/** Declare a signal once; producer, consumer, and every delivery boundary import the same ref. */
export function defineSignal<Payload>(name: string, schema: Schema.Schema<Payload>): Signal<Payload> {
  assertSignalName(name);
  return Object.freeze({ kind: "signal", name, schema });
}

/** The identity key of a running source instance: `(source, params)` — params hashed canonically
 * so `{ repo, pr }` and `{ pr, repo }` dedupe to the SAME instance. */
export function signalInstanceKey(sourceName: string, paramsHash: string): string {
  return `${sourceName}:${paramsHash}`;
}

/** The engine hands this to a source's `start(ctx)` — the engine's `stop()` runs when the
 * instance is orphaned (no live run holds a registration on it) or the host shuts down. */
export interface SignalSourceInstance {
  /** Idempotent teardown; may be absent (nothing to stop). */
  readonly stop?: () => Promise<void> | void;
}

/**
 * The context a source's `start(ctx)` receives. `emit` carries THIS instance's delivery
 * capability (design 42 §Security): a producer must hold the explicit capability to deliver
 * to a signal — ambient delivery would let anything drive someone else's run. The host mints
 * one capability per started instance; `emit` refuses signals not declared in `emits` and
 * payloads that fail the signal's schema (the host re-checks both at the delivery boundary).
 *
 * `getCursor`/`setCursor` are the durable cursor a push-only source needs for its catch-up
 * sweep (design 42 §6): `start()` re-runs after every restart, and a host-down window is only
 * bridgeable by a source that remembers where it last looked.
 */
export interface SignalSourceContext<Params> {
  readonly params: Params;
  readonly emit: SignalEmit;
  readonly getCursor: () => Promise<string | null>;
  readonly setCursor: (cursor: string) => Promise<void>;
}

/** One-way delivery of one signal instance of a source: `(signal, key, payload)`. `key`
 * scopes the event (a change-request number, an issue key) and joins to a consumer's
 * `waitFor` opts; the host fans the delivery out to every interested live run. */
export type SignalEmit = <Payload>(
  signal: Signal<Payload>,
  key: string,
  payload: Payload,
) => Promise<void>;

/**
 * A source declaration. `params` is the identity schema (stored + hashed, see
 * {@link signalInstanceKey}); `emits` is the declared signal set that narrows BOTH the
 * producer's `ctx.emit` and the consumer's `waitFor`.
 *
 * `builtin` marks a catalog source: its declaration lives here so a replayed body can import
 * and bind it, while its `start` behavior lives host-side (the host's source catalog is keyed
 * by `name`). Author-defined sources carry `start` directly instead.
 */
export interface SignalSourceRef<
  Params,
  Signals extends ReadonlyArray<Signal<unknown>> = ReadonlyArray<Signal<unknown>>,
  ParamsSchema = Schema.Schema<Params>,
> {
  readonly kind: "signalSource";
  readonly name: string;
  readonly params: ParamsSchema;
  readonly emits: Signals;
  readonly builtin?: boolean;
  readonly start?: (ctx: SignalSourceContext<Params>) => Promise<SignalSourceInstance>;
}

/** Declare a BUILT-IN (catalog) source: the shared declaration a body imports; the host
 * registers its `start` behavior under the same `name`. */
export function builtinSignalSource<
  const P,
  Signals extends ReadonlyArray<Signal<unknown>>,
>(opts: {
  readonly name: string;
  readonly params: P;
  readonly emits: Signals;
}): SignalSourceRef<Schema.Schema.Type<P>, Signals, P> {
  assertSignalName(opts.name);
  return Object.freeze({
    kind: "signalSource",
    name: opts.name,
    params: opts.params,
    emits: opts.emits,
    builtin: true,
  });
}

/** Is `signal` one this source declares? Both `ctx.emit` and `waitFor` enforce it. */
export function declaresSignal(
  source: { readonly emits: ReadonlyArray<Signal<unknown>> },
  signal: { readonly name: string },
): boolean {
  return source.emits.some((emitted) => emitted.name === signal.name);
}

/** `waitFor` narrowed by the source's `emits`: only declared signals typecheck, and the
 * payload type is the signal's own. */
export type SignalWaitFor<Signals extends ReadonlyArray<Signal<unknown>>> = {
  [K in keyof Signals]: Signals[K] extends Signal<infer P>
    ? (signal: Signals[K], opts: { readonly key: string }) => Promise<P>
    : never;
}[number];

/** The consumer half of the binding, returned by `getSignalSource`. `waitFor` journals a
 * durable `signal.wait` handle and parks the run until the source (or a durable inbox entry
 * that landed while the run was not parked) delivers the awaited `(signal, key)`. */
export interface SignalSourceHandle<Signals extends ReadonlyArray<Signal<unknown>>> {
  readonly sourceName: string;
  readonly paramsHash: string;
  readonly waitFor: SignalWaitFor<Signals>;
}

/** Decode a delivered payload against the signal's schema — the boundary check every
 * consumer applies, including when the reply is read back off the journal. */
export async function decodeSignalPayload<Payload>(
  signal: Signal<Payload>,
  reply: unknown,
): Promise<Payload> {
  return await decodeWithSchema(
    signal.schema,
    reply,
    `Invalid payload for signal '${signal.name}'`,
  );
}

export function assertSignalName(name: string): void {
  if (typeof name !== "string" || name.length === 0 || name.length > 128) {
    throw new WorkflowError(`Invalid signal source name: '${String(name)}'.`);
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    throw new WorkflowError(
      `Invalid signal source name '${name}': use lowercase dotted identifiers (e.g. 'scm.change-requests').`,
    );
  }
}

/** Validate + canonically hash a source's params (the instance-identity half of the key). */
export async function resolveSignalSourceParams<Params>(
  source: { readonly name: string; readonly params: unknown },
  params: unknown,
): Promise<{ readonly params: Params; readonly paramsHash: string }> {
  const validated = await decodeWithSchema(
    source.params as Schema.Schema<Params>,
    params,
    `Invalid params for signal source '${source.name}'`,
  );
  return { params: validated, paramsHash: hashArgs(validated) };
}
