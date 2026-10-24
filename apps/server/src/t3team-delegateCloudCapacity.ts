/**
 * How many delegated children a cloud session carries at once (default 3,
 * `NEXI_DELEGATE_CLOUD_CHILDREN_PER_SESSION`). Counted on this server: a delegation reserves a
 * slot by its request key BEFORE the session is probed (a failed probe releases it), so concurrent
 * delegations cannot all see room; the child then holds the slot while its latest run is open.
 * Children another server delegated to the same session are not seen.
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

export const DEFAULT_CHILDREN_PER_SESSION = 3;

export interface CloudSessionCapacity {
  readonly limit: number;
  /** Reserves a slot for the request when the session has room; true when it holds one. */
  readonly tryReserve: (requestKey: string, sessionId: string) => Effect.Effect<boolean>;
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

  const tryReserve = Effect.fn("CloudSessionCapacity.tryReserve")(function* (
    requestKey: string,
    sessionId: string,
  ) {
    const children = [...(yield* Ref.get(slots)).children].filter(
      ([, session]) => session === sessionId,
    );
    const ended = new Set(
      (yield* Effect.filter(children, ([threadId]) =>
        Effect.map(input.isActive(threadId), (active) => !active),
      )).map(([threadId]) => threadId),
    );
    return yield* Ref.modify(slots, (current): [boolean, Slots] => {
      const remaining = new Map([...current.children].filter(([threadId]) => !ended.has(threadId)));
      if (current.reserved.get(requestKey) === sessionId) {
        return [true, { ...current, children: remaining }];
      }
      const reserved = [...current.reserved.values()].filter((session) => session === sessionId);
      const held = [...remaining.values()].filter((session) => session === sessionId);
      if (held.length + reserved.length >= input.limit) {
        return [false, { ...current, children: remaining }];
      }
      return [
        true,
        { reserved: new Map(current.reserved).set(requestKey, sessionId), children: remaining },
      ];
    });
  });

  return {
    limit: input.limit,
    tryReserve,
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
