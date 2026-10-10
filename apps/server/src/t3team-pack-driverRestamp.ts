/**
 * Driver-identity restamping for a reused host adapter.
 *
 * A pack identity built on the host OpenCode harness runs the real OpenCode V2
 * adapter, whose sessions, provider threads, native refs and events all say
 * `driver: "opencode"`. Exposed under the pack's own driver kind, every value
 * leaving the adapter is restamped inner -> outer and every value entering it
 * outer -> inner, so persisted provider threads stay self-consistent
 * (`nativeThreadRef.driver === providerThread.driver === session.driver`,
 * which restart continuation checks) and the inner adapter still sees its own
 * identity.
 *
 * @module t3team-pack-driverRestamp
 */
import type { ProviderDriverKind } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import type {
  ProviderAdapterV2SessionRuntime,
  ProviderAdapterV2Shape,
} from "./orchestration-v2/ProviderAdapter.ts";

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** Replaces every `driver: from` in plain objects/arrays with `to`; class instances (DateTime) pass through. */
const restampDriver = <A>(value: A, from: ProviderDriverKind, to: ProviderDriverKind): A => {
  if (from === to) return value;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!isPlainObject(node)) return node;
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node)) {
      next[key] = key === "driver" && child === from ? to : walk(child);
    }
    return next;
  };
  return walk(value) as A;
};

const isEffectValue = (value: unknown): value is Effect.Effect<unknown> => Effect.isEffect(value);

const wrapMethods = <T extends object>(
  target: T,
  down: <A>(value: A) => A,
  up: <A>(value: A) => A,
): T => {
  const wrapped: Record<string, unknown> = {};
  for (const [key, member] of Object.entries(target)) {
    wrapped[key] =
      typeof member === "function"
        ? (...args: ReadonlyArray<unknown>) => {
            const result = (member as (...input: ReadonlyArray<unknown>) => unknown).apply(
              target,
              args.map(down),
            );
            // Every adapter method returns an Effect; its channels pass through untouched.
            return isEffectValue(result) ? Effect.map(result, up) : up(result);
          }
        : member;
  }
  return wrapped as T;
};

const restampRuntime = (
  runtime: ProviderAdapterV2SessionRuntime,
  inner: ProviderDriverKind,
  outer: ProviderDriverKind,
): ProviderAdapterV2SessionRuntime => {
  const up = <A>(value: A) => restampDriver(value, inner, outer);
  const down = <A>(value: A) => restampDriver(value, outer, inner);
  const { subscribeEvents } = runtime;
  return {
    ...wrapMethods(runtime, down, up),
    driver: outer,
    providerSession: up(runtime.providerSession),
    events: runtime.events.pipe(Stream.map(up)),
    ...(subscribeEvents === undefined
      ? {}
      : {
          subscribeEvents: subscribeEvents.pipe(
            Effect.map((subscription) => ({
              ...subscription,
              events: subscription.events.pipe(Stream.map(up)),
            })),
          ),
        }),
  };
};

/** The inner adapter re-identified as `outer`; its own `driver` is the inner identity. */
export const restampAdapter = (
  adapter: ProviderAdapterV2Shape,
  outer: ProviderDriverKind,
): ProviderAdapterV2Shape => {
  const inner = adapter.driver;
  if (inner === outer) return adapter;
  return {
    ...adapter,
    driver: outer,
    openSession: (input) =>
      adapter
        .openSession(restampDriver(input, outer, inner))
        .pipe(Effect.map((runtime) => restampRuntime(runtime, inner, outer))),
  };
};
