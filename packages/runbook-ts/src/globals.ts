/**
 * Deterministic globals for a trusted workflow VM context.
 *
 * This is the reusable part of the global surface: it supplies journal-backed Date, Math.random,
 * crypto.randomUUID, and host error intrinsics. Tool, thread, provider, and engine verbs remain
 * the adapter's responsibility and are merged by the caller.
 */

import * as NodeCrypto from "node:crypto";

import * as DateTime from "effect/DateTime";

import type { DeterministicSource } from "@runbook/core/runtimeTypes";

export type { DeterministicSource } from "@runbook/core/runtimeTypes";

export function hostErrorGlobals(): Record<string, unknown> {
  return { Error, TypeError, RangeError, SyntaxError };
}

export function makeJournaledDate(source: Pick<DeterministicSource, "now">): DateConstructor {
  const RealDate = Date;
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

export function makeJournaledMath(source: Pick<DeterministicSource, "random">): typeof Math {
  return Object.assign(Object.create(Math) as typeof Math, { random: () => source.random() });
}

export function makeJournaledCrypto(
  source: Pick<DeterministicSource, "uuid">,
): Record<string, unknown> {
  const hostCrypto = globalThis.crypto as unknown as Record<string, unknown>;
  return { ...hostCrypto, randomUUID: () => source.uuid() };
}

export function deterministicGlobals(source: DeterministicSource): Record<string, unknown> {
  return {
    ...hostErrorGlobals(),
    Date: makeJournaledDate(source),
    Math: makeJournaledMath(source),
    crypto: makeJournaledCrypto(source),
  };
}

/** Host wall-clock and entropy used for load-time metadata and runtime adapter wiring. */
export function hostSource(): DeterministicSource {
  return {
    now: () => DateTime.nowUnsafe().epochMilliseconds,
    random: () => NodeCrypto.randomInt(2 ** 32) / 2 ** 32,
    uuid: () => NodeCrypto.randomUUID(),
  };
}
