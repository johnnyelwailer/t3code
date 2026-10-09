/**
 * Server wiring for the queued-turn stall reaper. The sweeper starts only once
 * the server signals command-ready, i.e. after startup provider-session
 * reconciliation (serverRuntimeStartup.ts) has settled restart-orphaned
 * `starting` sessions - otherwise the first sweep could report those as
 * hours-long stalls. Event folding and replay start immediately.
 *
 * @module t3team-queuedTurnStallReactorLive
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { ServerRuntimeStartup } from "./serverRuntimeStartup.ts";
import { makeQueuedTurnStallReactor } from "./t3team-queuedTurnStallReactor.ts";

export const T3TeamQueuedTurnStallReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const startup = yield* ServerRuntimeStartup;
    const reactor = makeQueuedTurnStallReactor({ engine, query });
    yield* reactor.startEventStream();
    yield* reactor.rehydrate;
    yield* Effect.forkScoped(
      startup.awaitCommandReady.pipe(
        Effect.andThen(Effect.sync(() => reactor.startSweeper())),
        Effect.ignore,
      ),
    );
    yield* Effect.addFinalizer(() => Effect.sync(() => reactor.stop()));
  }),
);
