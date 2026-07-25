import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";

import {
  T3TeamContextRefreshError,
  type T3TeamContextRefreshInput,
  type T3TeamContextRefreshResult,
} from "./t3team-contextRefreshServiceTypes.ts";
import { logRefreshSuperseded } from "./t3team-contextRefreshTelemetry.ts";
import { normalizeTicketKey } from "./t3team-toolBrokerContextSyncScope.ts";

type RefreshDeferred = Deferred.Deferred<T3TeamContextRefreshResult, T3TeamContextRefreshError>;

export type T3TeamContextRefreshSupersession = {
  readonly aborted: () => boolean;
  readonly abort: () => void;
};

export function makeT3TeamContextRefreshSupersession(): T3TeamContextRefreshSupersession {
  let aborted = false;
  return {
    aborted: () => aborted,
    abort: () => {
      aborted = true;
    },
  };
}

export function assertT3TeamContextRefreshNotSuperseded(
  supersession: T3TeamContextRefreshSupersession | undefined,
) {
  return supersession?.aborted() ? Effect.fail(supersededRefreshError()) : Effect.void;
}

export function refreshDedupKey(
  input: Pick<T3TeamContextRefreshInput, "workspaceRoot" | "ticketKey">,
) {
  return `${input.workspaceRoot}|${normalizeTicketKey(input.ticketKey)}`;
}

export function supersededRefreshError(): T3TeamContextRefreshError {
  return new T3TeamContextRefreshError({
    message: "Context refresh superseded by a forced refresh for the same work item.",
  });
}

export function dedupRefreshWorkItem<R>(
  active: Map<string, RefreshDeferred>,
  supersessions: Map<string, T3TeamContextRefreshSupersession>,
  input: T3TeamContextRefreshInput,
  runRefresh: (
    supersession: T3TeamContextRefreshSupersession,
  ) => Effect.Effect<T3TeamContextRefreshResult, T3TeamContextRefreshError, R>,
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
    const supersession = makeT3TeamContextRefreshSupersession();
    supersessions.set(key, supersession);
    const deferred = yield* Deferred.make<T3TeamContextRefreshResult, T3TeamContextRefreshError>();
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
