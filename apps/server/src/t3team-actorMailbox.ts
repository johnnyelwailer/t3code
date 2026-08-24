/**
 * Per-thread mailbox for inter-agent ("actor") messages.
 *
 * The host has no turn queue of its own — a provider `sendTurn` is fire-and-
 * forget and running two turns on one session at once corrupts its state. So
 * when an actor message arrives for a thread that is mid-turn, it must wait.
 * This mailbox holds those queued messages and a per-thread `reacting` flag,
 * which together let {@link T3TeamActorMessageReactorLive} serialize reactions:
 * exactly one reaction turn per thread is in flight at a time.
 *
 * `takeNextForDispatch` is the atomic drain primitive: it hands back the WHOLE
 * pending batch (or up to a cap) for a thread (and flips `reacting` on) only
 * when the thread is not already reacting. The reactor pairs it with a read-
 * model "is the thread busy?" check; the `reacting` flag additionally covers
 * the brief window after a reaction is dispatched but before the projection
 * reflects the new running turn. Batching is what coalesces an inter-agent
 * message burst into ONE reaction turn instead of one turn per message.
 *
 * State is in-memory and process-local (matching the provider sessions it
 * guards); it is intentionally not persisted.
 *
 * @module t3team-actorMailbox
 */
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

export interface T3TeamActorMailboxEntry {
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
  readonly queue: ReadonlyArray<T3TeamActorMailboxEntry>;
  readonly reacting: boolean;
  /**
   * Set when the user explicitly stops this thread's turn. While true, a
   * queued actor message stays visible in the timeline but does NOT get
   * auto-dispatched into a reaction turn — otherwise an incoming actor
   * message re-opens the exact turn the user just told the agent to stop,
   * and "Stop generation" never converges. Cleared when the user sends the
   * thread's next real message (see T3TeamActorMessageReactorLive).
   */
  readonly suppressed: boolean;
}

const EMPTY: ThreadMailboxState = { queue: [], reacting: false, suppressed: false };

export interface T3TeamActorMailboxShape {
  /** Append an actor message to a thread's queue. */
  readonly enqueue: (threadId: string, entry: T3TeamActorMailboxEntry) => Effect.Effect<boolean>;
  /**
   * Atomically claim the pending batch for a thread: if the thread is not
   * already reacting and has queued entries, flip `reacting` on and return
   * them all (in arrival order, up to `cap` when given — anything past the
   * cap stays queued for the next drain); otherwise return `[]` and leave
   * state untouched.
   */
  readonly takeNextForDispatch: (
    threadId: string,
    cap?: number,
  ) => Effect.Effect<ReadonlyArray<T3TeamActorMailboxEntry>>;
  /** Release the reacting flag (called when the thread's turn ends). */
  readonly clearReacting: (threadId: string) => Effect.Effect<void>;
  /**
   * Release a failed claim and requeue the whole batch at the front (preserving
   * order), retrying up to the per-entry attempt cap.
   */
  readonly requeueFailed: (
    threadId: string,
    entries: ReadonlyArray<T3TeamActorMailboxEntry>,
  ) => Effect.Effect<boolean>;
  /** Whether a reaction turn is currently in flight for the thread. */
  readonly isReacting: (threadId: string) => Effect.Effect<boolean>;
  /** Mark the thread suppressed: queued/future actor messages enqueue but do not auto-dispatch. */
  readonly suppress: (threadId: string) => Effect.Effect<void>;
  /** Lift suppression (called when the user sends the thread's next real message). */
  readonly clearSuppression: (threadId: string) => Effect.Effect<void>;
  /** Whether auto-dispatch is currently suppressed for the thread. */
  readonly isSuppressed: (threadId: string) => Effect.Effect<boolean>;
}

export const makeT3TeamActorMailbox: Effect.Effect<T3TeamActorMailboxShape> = Effect.gen(
  function* () {
    const state = yield* Ref.make(new Map<string, ThreadMailboxState>());
    const knownMessageIds = yield* Ref.make(new Set<string>());

    const read = (map: Map<string, ThreadMailboxState>, threadId: string): ThreadMailboxState =>
      map.get(threadId) ?? EMPTY;

    const enqueue: T3TeamActorMailboxShape["enqueue"] = (threadId, entry) =>
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

    const takeNextForDispatch: T3TeamActorMailboxShape["takeNextForDispatch"] = (
      threadId,
      cap,
    ) =>
      Ref.modify(state, (map) => {
        const current = read(map, threadId);
        if (current.reacting || current.suppressed || current.queue.length === 0) {
          return [[], map] as const;
        }
        const limited =
          cap !== undefined && cap >= 0 ? current.queue.slice(0, cap) : current.queue;
        const rest = current.queue.slice(limited.length);
        const next = new Map(map);
        next.set(threadId, { ...current, queue: rest, reacting: true });
        return [limited, next] as const;
      });

    const clearReacting: T3TeamActorMailboxShape["clearReacting"] = (threadId) =>
      Ref.update(state, (map) => {
        const current = read(map, threadId);
        if (!current.reacting) {
          return map;
        }
        const next = new Map(map);
        next.set(threadId, { ...current, reacting: false });
        return next;
      });

    const requeueFailed: T3TeamActorMailboxShape["requeueFailed"] = (threadId, entries) =>
      Ref.modify(state, (map) => {
        const current = read(map, threadId);
        const retried = entries.filter(({ dispatchAttempts }) => dispatchAttempts + 1 < 3);
        const next = new Map(map);
        next.set(threadId, {
          ...current,
          queue: [
            ...retried.map((entry) => ({ ...entry, dispatchAttempts: entry.dispatchAttempts + 1 })),
            ...current.queue,
          ],
          reacting: false,
        });
        return [retried.length > 0, next] as const;
      });

    const isReacting: T3TeamActorMailboxShape["isReacting"] = (threadId) =>
      Ref.get(state).pipe(Effect.map((map) => read(map, threadId).reacting));

    const suppress: T3TeamActorMailboxShape["suppress"] = (threadId) =>
      Ref.update(state, (map) => {
        const current = read(map, threadId);
        if (current.suppressed) {
          return map;
        }
        const next = new Map(map);
        next.set(threadId, { ...current, suppressed: true });
        return next;
      });

    const clearSuppression: T3TeamActorMailboxShape["clearSuppression"] = (threadId) =>
      Ref.update(state, (map) => {
        const current = read(map, threadId);
        if (!current.suppressed) {
          return map;
        }
        const next = new Map(map);
        next.set(threadId, { ...current, suppressed: false });
        return next;
      });

    const isSuppressed: T3TeamActorMailboxShape["isSuppressed"] = (threadId) =>
      Ref.get(state).pipe(Effect.map((map) => read(map, threadId).suppressed));

    return {
      enqueue,
      takeNextForDispatch,
      clearReacting,
      requeueFailed,
      isReacting,
      suppress,
      clearSuppression,
      isSuppressed,
    };
  },
);
