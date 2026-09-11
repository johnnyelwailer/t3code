/**
 * Limits + pure helpers for the actor-message reactor (split out of
 * `t3team-actorMessageReactor.ts`): hop cap, coalescing debounce window,
 * per-turn batch cap, and the thread-busy check.
 */

/**
 * Maximum number of auto-reaction hops in a single actor-message chain. A
 * human-initiated message is hop 0; each agent that reacts and messages another
 * actor increments the hop. Past the cap the message is surfaced but not
 * reacted to, so a self-sustaining loop cannot run away.
 */
export const T3TEAM_ACTOR_MESSAGE_HOP_CAP = 6;

/**
 * Inter-agent coalescing: how long a drain waits before claiming the pending
 * batch while the thread is idle, so quiet threads are not woken into heavy
 * reaction turns by low-stakes coordinated chatter. Distribution-tunable via
 * `T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS` (0 disables the window — claims happen
 * immediately, still batched). An `urgent` entry in the pending batch
 * bypasses the window (claims immediately, see the reactor's drain).
 */
export const T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS = 45_000;
const T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS_ENV = "T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS";

/** Resolve the coalescing debounce window, honoring the env override. */
export function resolveActorMessageDebounceMs(): number {
  const raw = process.env[T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS_ENV]?.trim();
  if (raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS;
}

/**
 * Safety valve on a coalesced batch: at most this many deliveries per reaction
 * turn (each body is already summarized on delivery). Anything past the cap
 * stays queued and flushes as the next batch after this turn settles.
 * Distribution-tunable via `T3TEAM_ACTOR_MESSAGE_BATCH_MAX`.
 */
export const T3TEAM_ACTOR_MESSAGE_BATCH_MAX = 10;
const T3TEAM_ACTOR_MESSAGE_BATCH_MAX_ENV = "T3TEAM_ACTOR_MESSAGE_BATCH_MAX";

/** Resolve the per-turn batch cap, honoring the env override. */
export function resolveActorMessageBatchMax(): number {
  const raw = process.env[T3TEAM_ACTOR_MESSAGE_BATCH_MAX_ENV]?.trim();
  if (raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.floor(parsed);
    }
  }
  return T3TEAM_ACTOR_MESSAGE_BATCH_MAX;
}

export const isThreadBusy = (thread: {
  readonly session: { readonly status: string } | null;
  readonly latestTurn: { readonly state: string } | null;
}): boolean => {
  const status = thread.session?.status;
  if (status === "running" || status === "starting") {
    return true;
  }
  return thread.latestTurn?.state === "running";
};
