/**
 * T3Team's signal-source consumer adapter (design 42) — the `getSignalSource` engine verb.
 *
 * `getSignalSource(source, params)` journals a durable `signal.register` binding (one-way:
 * the host's reconciler derives the live source set from these entries) and returns the
 * consumer handle. `handle.waitFor(signal, { key })` journals a `signal.wait` ask and parks
 * the run until the host delivers the awaited `(signal, key)` — either live from a running
 * source instance or from a durable inbox entry that landed while the run was not parked.
 *
 * Two engine-level guarantees, both replay-deterministic:
 *   • INSTANCE DEDUP — the register args are `{ source, params }` canonically hashed, so two
 *     binds of the same `(source, params)` journal to the same instance identity and the host
 *     reconciles them into ONE running instance.
 *   • KEY DEDUP — two `waitFor`s in one run for the same `(signal, key)` share one journal
 *     handle, so a single delivery wakes both awaits with the same payload.
 *
 * Capability gate (design 42 §Security): binding a source requires the run to declare
 * `"source:<sourceName>"` in its `meta.capabilities` — the same call-site gate shape as
 * `waitUntil`/`"schedule"` (fail early, PermissionDeniedError).
 */

import type { MessageBroker } from "@runbook/threads/broker";
import type { HandleDispatch } from "@runbook/core/handles";

import {
  declaresSignal,
  decodeSignalPayload,
  resolveSignalSourceParams,
  type Signal,
  type SignalSourceHandle,
  type SignalSourceRef,
} from "./t3team-sdk.signal.ts";
import { BUILTIN_SIGNAL_SOURCES } from "./t3team-sdk.builtinSignals.ts";
import { PermissionDeniedError } from "./t3team-sdk.errors.ts";

/** The source names the host can actually START today: the built-in catalog. Author-defined
 * sources (`defineSignalSource`) have no host-side `start` channel yet (design #142 follow-up,
 * GHE #332) — binding one would park the run forever with no source to ever wake it, so the
 * gate fails LOUD at bind time instead. */
const BUILTIN_SOURCE_NAMES: ReadonlySet<string> = new Set(
  BUILTIN_SIGNAL_SOURCES.map((source) => source.name),
);

export interface SignalPrimitives {
  readonly getSignalSource: <Params, Signals extends ReadonlyArray<Signal<unknown>>>(
    source: SignalSourceRef<Params, Signals, unknown>,
    params: Params,
  ) => Promise<SignalSourceHandle<Signals>>;
}

export function createSignalPrimitives(deps: {
  readonly dispatch: HandleDispatch;
  readonly broker: MessageBroker;
  readonly capabilities: ReadonlySet<string>;
}): SignalPrimitives {
  const getSignalSource = async <Params, Signals extends ReadonlyArray<Signal<unknown>>>(
    source: SignalSourceRef<Params, Signals, unknown>,
    params: Params,
  ): Promise<SignalSourceHandle<Signals>> => {
    const required = `source:${source.name}`;
    if (!deps.capabilities.has(required)) {
      throw new PermissionDeniedError(
        `'getSignalSource(${source.name})' requires the '${required}' capability. Add ` +
          `'${required}' to this workflow's meta.capabilities.`,
      );
    }
    if (!BUILTIN_SOURCE_NAMES.has(source.name)) {
      throw new Error(
        `'getSignalSource(${source.name})' failed: '${source.name}' is not a built-in catalog source. ` +
          `Only the built-in sources can be started by the host today ` +
          `[${[...BUILTIN_SOURCE_NAMES].join(", ")}]. ` +
          `Author-defined sources (defineSignalSource) need a host-side start channel — see the design doc follow-up (GHE #332).`,
      );
    }
    const { paramsHash } = await resolveSignalSourceParams(source, params);
    // The binding is a journaled FACT (one-way handle): replay never re-fires it, and the host
    // derives the desired live source set from these entries — deduped by instance identity.
    await deps.dispatch.sendOneWay({
      kind: "signal.register",
      refId: source.name,
      args: { source: source.name, params, paramsHash },
      fire: (correlationId, resolver) =>
        deps.broker.send(
          {
            correlationId,
            kind: "signal.register",
            payload: { source: source.name, params, paramsHash },
          },
          resolver,
        ),
    });
    // In-run dedup map: (signal, key) → correlationId. Rebuilt deterministically on replay
    // because the first `send` returns the RECORDED correlationId without re-firing.
    const pendingByKey = new Map<string, string>();
    const waitFor = async <Payload>(
      signal: Signal<Payload> & { readonly name: string },
      opts: { readonly key: string },
    ): Promise<Payload> => {
      if (!declaresSignal(source, signal)) {
        throw new Error(
          `Signal '${signal.name}' is not declared in source '${source.name}''s emits.`,
        );
      }
      const dedupeKey = `${signal.name}:${opts.key}`;
      const existing = pendingByKey.get(dedupeKey);
      if (existing !== undefined) {
        return await deps.dispatch.awaitResolution(existing, (reply) =>
          decodeSignalPayload(signal, reply),
        );
      }
      const correlationId = await deps.dispatch.send({
        kind: "signal.wait",
        refId: source.name,
        args: { source: source.name, paramsHash, signal: signal.name, key: opts.key },
        fire: (cid, resolver) =>
          deps.broker.send(
            {
              correlationId: cid,
              kind: "signal.wait",
              payload: { source: source.name, paramsHash, signal: signal.name, key: opts.key },
            },
            resolver,
          ),
      });
      pendingByKey.set(dedupeKey, correlationId);
      return await deps.dispatch.awaitResolution(correlationId, (reply) =>
        decodeSignalPayload(signal, reply),
      );
    };
    return {
      sourceName: source.name,
      paramsHash,
      waitFor: waitFor as SignalSourceHandle<Signals>["waitFor"],
    };
  };
  return { getSignalSource };
}
