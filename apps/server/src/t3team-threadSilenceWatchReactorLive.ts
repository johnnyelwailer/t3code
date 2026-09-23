import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { ThreadBackgroundLivenessService } from "./orchestration/ThreadBackgroundLiveness.ts";
import { ThreadSilenceWatchdogService } from "./orchestration/ThreadSilenceWatchdog.ts";
import { makeThreadSilenceWatchReactor } from "./t3team-threadSilenceWatchReactor.ts";

export const T3TeamThreadSilenceWatchReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const watchdog = yield* ThreadSilenceWatchdogService;
    const liveness = yield* ThreadBackgroundLivenessService;
    const reactor = makeThreadSilenceWatchReactor({
      engine,
      query,
      watchdog,
      getLiveness: (threadId) => liveness.getThreadBackgroundLiveness(threadId),
    });
    yield* reactor.startEventStream();
    reactor.startSweeper();
    yield* reactor.rehydrate;
    yield* Effect.addFinalizer(() => Effect.sync(() => reactor.stop()));
  }),
);
