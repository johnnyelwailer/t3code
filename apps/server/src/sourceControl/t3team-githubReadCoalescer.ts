import * as Clock from "effect/Clock";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

/** Past this many kept answers the oldest go, so a long-lived server never grows without bound. */
const MAX_ENTRIES = 512;
/** A kept answer's weight (its body length), summed, may not pass this: file bodies are large. */
const MAX_WEIGHT = 16 * 1024 * 1024;

/**
 * Shares one GitHub read between every caller that asks for the same key within a short window:
 * concurrent callers ride the one request already in flight (single flight), and a later caller
 * inside the window is answered from the last success. Failures are shared with the callers that
 * were waiting, then forgotten, so the next ask goes to GitHub again.
 *
 * Process-wide on purpose: this is what stops N clients, N WebSocket connections or N projects
 * from multiplying one read against a rate-limited host.
 */
export interface GitHubReadCoalescer<A, E> {
  readonly share: <R>(
    key: string,
    ttl: Duration.Input,
    load: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}

/** Only a plain unconditional GET may be shared: a write or a revalidation must reach GitHub. */
export function isCoalescible<
  T extends {
    readonly method?: string;
    readonly body?: unknown;
    readonly ifNoneMatch?: string;
    readonly coalesce?: unknown;
  },
>(input: T): input is T & { readonly coalesce: NonNullable<T["coalesce"]> } {
  return (
    input.coalesce !== undefined &&
    (input.method === undefined || input.method === "GET") &&
    input.body === undefined &&
    input.ifNoneMatch === undefined
  );
}

export function makeGitHubReadCoalescer<A, E>(
  weigh: (value: A) => number = () => 0,
): GitHubReadCoalescer<A, E> {
  const kept = new Map<
    string,
    { readonly expiresAtMs: number; readonly value: A; readonly weight: number }
  >();
  let keptWeight = 0;

  const forget = (key: string) => {
    keptWeight -= kept.get(key)?.weight ?? 0;
    kept.delete(key);
  };

  const remember = (key: string, value: A, expiresAtMs: number, nowMs: number) => {
    forget(key);
    const weight = weigh(value);
    kept.set(key, { expiresAtMs, value, weight });
    keptWeight += weight;
    for (const [candidate, entry] of kept) {
      const withinBounds = kept.size <= MAX_ENTRIES && keptWeight <= MAX_WEIGHT;
      if (withinBounds || candidate === key) return;
      if (entry.expiresAtMs <= nowMs || !withinBounds) forget(candidate);
    }
  };

  /** An undefined flight result means its leader was interrupted: the waiter takes over. */
  type Flight = Deferred.Deferred<Exit.Exit<A, E> | undefined>;
  const inFlight = new Map<string, Flight>();

  const lead = <R>(key: string, ttlMs: number, load: Effect.Effect<A, E, R>) =>
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const flight: Flight = Deferred.makeUnsafe();
        inFlight.set(key, flight);
        const exit = yield* Effect.exit(restore(load));
        inFlight.delete(key);
        if (Exit.isSuccess(exit)) {
          const nowMs = yield* Clock.currentTimeMillis;
          remember(key, exit.value, nowMs + ttlMs, nowMs);
        }
        yield* Deferred.succeed(flight, Exit.hasInterrupts(exit) ? undefined : exit);
        return yield* exit;
      }),
    );

  const share: GitHubReadCoalescer<A, E>["share"] = <R>(
    key: string,
    ttl: Duration.Input,
    load: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R> =>
    Effect.gen(function* () {
      const nowMs = yield* Clock.currentTimeMillis;
      const hit = kept.get(key);
      if (hit !== undefined && hit.expiresAtMs > nowMs) return hit.value;
      const flight = inFlight.get(key);
      if (flight === undefined) return yield* lead(key, Duration.toMillis(ttl), load);
      const settled = yield* Deferred.await(flight);
      return settled === undefined ? yield* share(key, ttl, load) : yield* settled;
    });

  return { share };
}
