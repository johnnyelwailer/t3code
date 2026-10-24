/**
 * How many delegated children a cloud session carries at once (default 3,
 * `NEXI_DELEGATE_CLOUD_CHILDREN_PER_SESSION`). Counted on this server: a delegation reserves a
 * slot by its request key until its child exists, then the child holds it while its latest run is
 * open. Children another server delegated to the same session are not seen.
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

export const DEFAULT_CHILDREN_PER_SESSION = 3;

export interface CloudSessionCapacity {
  readonly limit: number;
  readonly hasRoom: (sessionId: string) => Effect.Effect<boolean>;
  readonly reserve: (requestKey: string, sessionId: string) => Effect.Effect<void>;
  readonly register: (requestKey: string, childThreadId: ThreadId) => Effect.Effect<void>;
  readonly release: (requestKey: string) => Effect.Effect<void>;
}

interface Slots {
  readonly reserved: ReadonlyMap<string, string>;
  readonly children: ReadonlyMap<ThreadId, string>;
}

export const makeCloudSessionCapacity = Effect.fn("CloudSessionCapacity.make")(function* (input: {
  readonly limit: number;
  /** Whether the child still runs (its latest run is open). */
  readonly isActive: (childThreadId: ThreadId) => Effect.Effect<boolean>;
}) {
  const slots = yield* Ref.make<Slots>({ reserved: new Map(), children: new Map() });

  const hasRoom = Effect.fn("CloudSessionCapacity.hasRoom")(function* (sessionId: string) {
    const current = yield* Ref.get(slots);
    const children = [...current.children].filter(([, session]) => session === sessionId);
    const active = yield* Effect.filter(children, ([threadId]) => input.isActive(threadId));
    const ended = new Set(children.map(([threadId]) => threadId));
    for (const [threadId] of active) ended.delete(threadId);
    if (ended.size > 0) {
      yield* Ref.update(slots, (latest) => ({
        ...latest,
        children: new Map([...latest.children].filter(([threadId]) => !ended.has(threadId))),
      }));
    }
    const reserved = [...current.reserved.values()].filter((session) => session === sessionId);
    return active.length + reserved.length < input.limit;
  });

  return {
    limit: input.limit,
    hasRoom,
    reserve: (requestKey, sessionId) =>
      Ref.update(slots, (current) => ({
        ...current,
        reserved: new Map(current.reserved).set(requestKey, sessionId),
      })),
    register: (requestKey, childThreadId) =>
      Ref.update(slots, (current) => {
        const sessionId = current.reserved.get(requestKey);
        if (sessionId === undefined) return current;
        const reserved = new Map(current.reserved);
        reserved.delete(requestKey);
        return { reserved, children: new Map(current.children).set(childThreadId, sessionId) };
      }),
    release: (requestKey) =>
      Ref.update(slots, (current) => {
        const reserved = new Map(current.reserved);
        reserved.delete(requestKey);
        return { ...current, reserved };
      }),
  } satisfies CloudSessionCapacity;
});
