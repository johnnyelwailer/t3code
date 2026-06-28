import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";

import {
  T3workContextRefreshError,
  type T3workContextRefreshInput,
  type T3workContextRefreshResult,
} from "./t3work-contextRefreshServiceTypes.ts";
import { logRefreshSuperseded } from "./t3work-contextRefreshTelemetry.ts";
import { normalizeTicketKey } from "./t3work-toolBrokerContextSyncScope.ts";

type RefreshDeferred = Deferred.Deferred<T3workContextRefreshResult, T3workContextRefreshError>;

export type T3workContextRefreshSupersession = {
  readonly aborted: () => boolean;
  readonly abort: () => void;
};

export function makeT3workContextRefreshSupersession(): T3workContextRefreshSupersession {
  let aborted = false;
  return {
    aborted: () => aborted,
    abort: () => {
      aborted = true;
    },
  };
}

export function assertT3workContextRefreshNotSuperseded(
  supersession: T3workContextRefreshSupersession | undefined,
) {
  return supersession?.aborted() ? Effect.fail(supersededRefreshError()) : Effect.void;
}

export function refreshDedupKey(
  input: Pick<T3workContextRefreshInput, "workspaceRoot" | "ticketKey">,
) {
  return `${input.workspaceRoot}|${normalizeTicketKey(input.ticketKey)}`;
}

export function supersededRefreshError(): T3workContextRefreshError {
  return new T3workContextRefreshError({
    message: "Context refresh superseded by a forced refresh for the same work item.",
  });
}

export function dedupRefreshWorkItem<R>(
  active: Map<string, RefreshDeferred>,
  supersessions: Map<string, T3workContextRefreshSupersession>,
  input: T3workContextRefreshInput,
  runRefresh: (
    supersession: T3workContextRefreshSupersession,
  ) => Effect.Effect<T3workContextRefreshResult, T3workContextRefreshError, R>,
) {
  return Effect.gen(function* () {
    const key = refreshDedupKey(input);
    const existing = active.get(key);
    if (existing && !input.force) {
      return yield* Deferred.await(existing);
    }
    if (existing && input.force) {
      supersessions.get(key)?.abort();
      yield* logRefreshSuperseded({
        ticketKey: input.ticketKey,
        workspaceRoot: input.workspaceRoot,
      });
      yield* Deferred.fail(existing, supersededRefreshError());
    }
    const supersession = makeT3workContextRefreshSupersession();
    supersessions.set(key, supersession);
    const deferred = yield* Deferred.make<T3workContextRefreshResult, T3workContextRefreshError>();
    active.set(key, deferred);
    return yield* runRefresh(supersession).pipe(
      Effect.tap((result) => Deferred.succeed(deferred, result)),
      Effect.tapError((error) => Deferred.fail(deferred, error)),
      Effect.ensuring(
        Effect.sync(() => {
          if (active.get(key) === deferred) {
            active.delete(key);
          }
          if (supersessions.get(key) === supersession) {
            supersessions.delete(key);
          }
        }),
      ),
    );
  });
}
