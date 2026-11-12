/**
 * delegate_task's cloud placement, once per request key (the clientRequestId). A retried request
 * runs preparation again, and a retry of an accepted delegation must not place, reserve or start
 * anything a second time: concurrent and later retries of one key get the first request's result
 * (the same session, model selection and note). A placement that failed is forgotten, so a later
 * retry places afresh; so is one interrupted or dying while placing, and one whose delegation
 * created no child (`forget`). Process memory.
 */
import type { ModelSelection, OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Ref from "effect/Ref";

export interface CloudChildPlacementRecord {
  readonly sessionId: string;
  readonly repositoryKey: string;
  readonly modelSelection: ModelSelection;
  readonly note: string;
}

type Entry = Deferred.Deferred<CloudChildPlacementRecord, OrchestratorMcpFailure>;

export interface CloudPlacementReplays {
  /** The placement for `requestKey`; `fresh` only for the request that ran it. */
  readonly once: (
    requestKey: string,
    place: Effect.Effect<CloudChildPlacementRecord, OrchestratorMcpFailure>,
  ) => Effect.Effect<
    { readonly record: CloudChildPlacementRecord; readonly fresh: boolean },
    OrchestratorMcpFailure
  >;
  readonly forget: (requestKey: string) => Effect.Effect<void>;
}

export const makeCloudPlacementReplays = Effect.gen(function* () {
  const entries = yield* Ref.make(new Map<string, Entry>());
  const forget = (requestKey: string) =>
    Ref.update(entries, (current) => {
      const next = new Map(current);
      next.delete(requestKey);
      return next;
    });
  const once = Effect.fn("CloudPlacementReplays.once")(function* (
    requestKey: string,
    place: Effect.Effect<CloudChildPlacementRecord, OrchestratorMcpFailure>,
  ) {
    const fresh = yield* Deferred.make<CloudChildPlacementRecord, OrchestratorMcpFailure>();
    const existing = yield* Ref.modify(
      entries,
      (current): [Entry | undefined, Map<string, Entry>] => {
        const found = current.get(requestKey);
        return found === undefined
          ? [undefined, new Map(current).set(requestKey, fresh)]
          : [found, current];
      },
    );
    if (existing !== undefined) {
      return { record: yield* Deferred.await(existing), fresh: false };
    }
    const record = yield* place.pipe(
      Effect.onExit((exit) =>
        Deferred.done(fresh, exit).pipe(
          Effect.andThen(Exit.isFailure(exit) ? forget(requestKey) : Effect.void),
        ),
      ),
    );
    return { record, fresh: true };
  });
  return { once, forget } satisfies CloudPlacementReplays;
});
