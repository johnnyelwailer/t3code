import {
  WS_METHODS,
  type T3TeamEnvironmentCapabilities,
  type T3TeamSubscribeThreadArtifactsInput,
  type T3TeamThreadArtifact,
  type T3TeamThreadArtifactsStreamEvent,
} from "@t3tools/contracts";
import * as Stream from "effect/Stream";
import type { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { subscribeWhenSupported } from "../rpc/t3team-capabilityGatedSubscription.ts";
import { createEnvironmentSubscriptionAtomFamily } from "./runtime.ts";
import { THREAD_STATE_IDLE_TTL_MS } from "./threadRetention.ts";

/**
 * A thread's fork artifacts (widgets, draft mutations, cards, pack-defined
 * kinds) in timeline order: `createdAt`, then `id` so equal instants render
 * in a stable order. Renderers pick by `kind` and place a row next to
 * `messageId` when set, otherwise in the timeline at `createdAt`.
 */
export type T3TeamThreadArtifacts = ReadonlyArray<T3TeamThreadArtifact>;

export const EMPTY_T3TEAM_THREAD_ARTIFACTS: T3TeamThreadArtifacts = [];

export const supportsT3TeamThreadArtifacts = (
  capabilities: T3TeamEnvironmentCapabilities | undefined,
): boolean => capabilities?.threadArtifacts === true;

const compareArtifacts = (left: T3TeamThreadArtifact, right: T3TeamThreadArtifact) =>
  left.createdAt < right.createdAt
    ? -1
    : left.createdAt > right.createdAt
      ? 1
      : left.id < right.id
        ? -1
        : left.id > right.id
          ? 1
          : 0;

/**
 * Folds one stream event into the thread's artifact list. Each
 * (re)subscription opens with the thread's `snapshot`, which replaces the
 * list, so artifacts removed while disconnected do not linger.
 */
export function applyT3TeamThreadArtifactsEvent(
  state: T3TeamThreadArtifacts,
  event: T3TeamThreadArtifactsStreamEvent,
): T3TeamThreadArtifacts {
  switch (event.type) {
    case "snapshot":
      return [...event.artifacts].sort(compareArtifacts);
    case "upsert":
      return [
        ...state.filter((artifact) => artifact.id !== event.artifact.id),
        event.artifact,
      ].sort(compareArtifacts);
    case "removed":
      return state.some((artifact) => artifact.id === event.artifactId)
        ? state.filter((artifact) => artifact.id !== event.artifactId)
        : state;
  }
}

/**
 * `artifacts({ environmentId, input: { threadId } })` follows one thread's
 * artifacts. The node shares the live thread state's idle TTL, so a thread
 * view that remounts within the window reuses the open stream. On servers
 * without the `t3team.threadArtifacts` capability the atom settles on an empty
 * list and never sends the fork RPC.
 */
export function createT3TeamThreadArtifactsAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    artifacts: createEnvironmentSubscriptionAtomFamily(runtime, {
      label: "environment-data:t3team:thread-artifacts",
      idleTtlMs: THREAD_STATE_IDLE_TTL_MS,
      subscribe: (input: T3TeamSubscribeThreadArtifactsInput) =>
        subscribeWhenSupported(WS_METHODS.t3teamSubscribeThreadArtifacts, input, {
          supported: supportsT3TeamThreadArtifacts,
          unsupported: { type: "snapshot", threadId: input.threadId, artifacts: [] },
        }).pipe(Stream.scan(EMPTY_T3TEAM_THREAD_ARTIFACTS, applyT3TeamThreadArtifactsEvent)),
    }),
  };
}
