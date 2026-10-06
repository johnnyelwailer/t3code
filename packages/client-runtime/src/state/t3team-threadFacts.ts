import {
  WS_METHODS,
  type T3TeamEnvironmentCapabilities,
  type T3TeamSubscribeThreadFactsInput,
  type T3TeamThreadFacts,
  type T3TeamThreadFactsStreamEvent,
  type ThreadId,
} from "@t3tools/contracts";
import * as Stream from "effect/Stream";
import type { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { subscribeWhenSupported } from "../rpc/t3team-capabilityGatedSubscription.ts";
import { createEnvironmentSubscriptionAtomFamily } from "./runtime.ts";

/**
 * Fork thread facts (workflow run status, child status, activity label,
 * environment binding, retention, pack extensions) keyed by thread id. They
 * ride their own side stream because the V2 thread shell does not carry them:
 * merge them over the shell by `threadId`, and treat a missing entry as
 * "no fork facts" — never as a reason to hide or alter the thread.
 */
export type T3TeamThreadFactsByThreadId = ReadonlyMap<ThreadId, T3TeamThreadFacts>;

export const EMPTY_T3TEAM_THREAD_FACTS: T3TeamThreadFactsByThreadId = new Map();

export const supportsT3TeamThreadFacts = (
  capabilities: T3TeamEnvironmentCapabilities | undefined,
): boolean => capabilities?.threadFacts === true;

/**
 * Folds one stream event into the facts map. Every (re)subscription opens with
 * a `snapshot`, which replaces the map wholesale, so a session change or a
 * server restart cannot leave facts behind for threads that lost them.
 */
export function applyT3TeamThreadFactsEvent(
  state: T3TeamThreadFactsByThreadId,
  event: T3TeamThreadFactsStreamEvent,
): T3TeamThreadFactsByThreadId {
  switch (event.type) {
    case "snapshot":
      return new Map(event.facts.map((facts) => [facts.threadId, facts]));
    case "upsert": {
      const next = new Map(state);
      next.set(event.facts.threadId, event.facts);
      return next;
    }
    case "removed": {
      if (!state.has(event.threadId)) return state;
      const next = new Map(state);
      next.delete(event.threadId);
      return next;
    }
  }
}

/**
 * `facts({ environmentId, input: {} })` follows every thread's facts in the
 * environment (sidebar, rosters); `input: { threadId }` follows one thread.
 * On servers without the `t3team.threadFacts` capability the atom settles on
 * an empty map and never sends the fork RPC.
 */
export function createT3TeamThreadFactsAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    facts: createEnvironmentSubscriptionAtomFamily(runtime, {
      label: "environment-data:t3team:thread-facts",
      subscribe: (input: T3TeamSubscribeThreadFactsInput) =>
        subscribeWhenSupported(WS_METHODS.t3teamSubscribeThreadFacts, input, {
          supported: supportsT3TeamThreadFacts,
          unsupported: { type: "snapshot", facts: [] },
        }).pipe(Stream.scan(() => EMPTY_T3TEAM_THREAD_FACTS, applyT3TeamThreadFactsEvent)),
    }),
  };
}
