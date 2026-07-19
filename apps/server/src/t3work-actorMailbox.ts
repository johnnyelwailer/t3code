/**
 * Per-thread mailbox for inter-agent ("actor") messages.
 *
 * The host has no turn queue of its own — a provider `sendTurn` is fire-and-
 * forget and running two turns on one session at once corrupts its state. So
 * when an actor message arrives for a thread that is mid-turn, it must wait.
 * This mailbox holds those queued messages and a per-thread `reacting` flag,
 * which together let {@link T3workActorMessageReactorLive} serialize reactions:
 * exactly one reaction turn per thread is in flight at a time.
 *
 * `takeNextForDispatch` is the atomic drain primitive: it hands back the next
 * queued entry (and flips `reacting` on) only when the thread is not already
 * reacting. The reactor pairs it with a read-model "is the thread busy?" check;
 * the `reacting` flag additionally covers the brief window after a reaction is
 * dispatched but before the projection reflects the new running turn.
 *
 * State is in-memory and process-local (matching the provider sessions it
 * guards); it is intentionally not persisted.
 *
 * @module t3work-actorMailbox
 */
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

export interface T3workActorMailboxEntry {
  readonly messageId: string;
  readonly fromThreadId: string;
  readonly fromTitle: string;
  readonly fromProjectId: string;
  readonly text: string;
  readonly urgency: "normal" | "urgent";
  readonly hopCount: number;
  readonly rootThreadId: string;
  readonly createdAt: string;
  readonly dispatchAttempts: number;
}

interface ThreadMailboxState {
  readonly queue: ReadonlyArray<T3workActorMailboxEntry>;
  readonly reacting: boolean;
}

const EMPTY: ThreadMailboxState = { queue: [], reacting: false };

export interface T3workActorMailboxShape {
  /** Append an actor message to a thread's queue. */
  readonly enqueue: (threadId: string, entry: T3workActorMailboxEntry) => Effect.Effect<boolean>;
  /**
   * Atomically claim the next entry for a thread: if the thread is not already
   * reacting and has a queued entry, flip `reacting` on and return that entry;
   * otherwise return `undefined` and leave state untouched.
   */
  readonly takeNextForDispatch: (
    threadId: string,
  ) => Effect.Effect<T3workActorMailboxEntry | undefined>;
  /** Release the reacting flag (called when the thread's turn ends). */
  readonly clearReacting: (threadId: string) => Effect.Effect<void>;
  /** Release a failed claim and retry it at the front, up to the attempt cap. */
  readonly requeueFailed: (
    threadId: string,
    entry: T3workActorMailboxEntry,
  ) => Effect.Effect<boolean>;
  /** Whether a reaction turn is currently in flight for the thread. */
  readonly isReacting: (threadId: string) => Effect.Effect<boolean>;
}

export const makeT3workActorMailbox: Effect.Effect<T3workActorMailboxShape> = Effect.gen(
  function* () {
    const state = yield* Ref.make(new Map<string, ThreadMailboxState>());
    const knownMessageIds = yield* Ref.make(new Set<string>());

    const read = (map: Map<string, ThreadMailboxState>, threadId: string): ThreadMailboxState =>
      map.get(threadId) ?? EMPTY;

    const enqueue: T3workActorMailboxShape["enqueue"] = (threadId, entry) =>
      Ref.modify(knownMessageIds, (known) => {
        if (known.has(entry.messageId)) return [false, known] as const;
        const next = new Set(known);
        next.add(entry.messageId);
        return [true, next] as const;
      }).pipe(
        Effect.tap((fresh) =>
          fresh
            ? Ref.update(state, (map) => {
                const current = read(map, threadId);
                const next = new Map(map);
                next.set(threadId, { ...current, queue: [...current.queue, entry] });
                return next;
              })
            : Effect.void,
        ),
      );

    const takeNextForDispatch: T3workActorMailboxShape["takeNextForDispatch"] = (threadId) =>
      Ref.modify(state, (map) => {
        const current = read(map, threadId);
        if (current.reacting || current.queue.length === 0) {
          return [undefined, map] as const;
        }
        const [head, ...rest] = current.queue;
        const next = new Map(map);
        next.set(threadId, { queue: rest, reacting: true });
        return [head, next] as const;
      });

    const clearReacting: T3workActorMailboxShape["clearReacting"] = (threadId) =>
      Ref.update(state, (map) => {
        const current = read(map, threadId);
        if (!current.reacting) {
          return map;
        }
        const next = new Map(map);
        next.set(threadId, { ...current, reacting: false });
        return next;
      });

    const requeueFailed: T3workActorMailboxShape["requeueFailed"] = (threadId, entry) =>
      Ref.modify(state, (map) => {
        const current = read(map, threadId);
        const attempts = entry.dispatchAttempts + 1;
        const retry = attempts < 3;
        const next = new Map(map);
        next.set(threadId, {
          queue: retry
            ? [{ ...entry, dispatchAttempts: attempts }, ...current.queue]
            : current.queue,
          reacting: false,
        });
        return [retry, next] as const;
      });

    const isReacting: T3workActorMailboxShape["isReacting"] = (threadId) =>
      Ref.get(state).pipe(Effect.map((map) => read(map, threadId).reacting));

    return { enqueue, takeNextForDispatch, clearReacting, requeueFailed, isReacting };
  },
);
