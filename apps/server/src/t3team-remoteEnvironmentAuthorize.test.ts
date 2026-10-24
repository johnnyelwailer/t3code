import { assert, describe, it } from "@effect/vitest";
import {
  type OrchestrationV2AppThreadLineage,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";

import {
  type CloudChildPlacementMarkers,
  makeMemoryCloudChildPlacementMarkers,
} from "./t3team-cloudChildPlacementMarkers.ts";
import { makeRemoteEnvironmentAuthorizer } from "./t3team-remoteEnvironmentAuthorize.ts";
import { makeRemoteEnvironmentPlacements } from "./t3team-remoteEnvironmentPlacements.ts";
import { REPOSITORY, turn } from "./t3team-remoteEnvironmentSession.fixtures.ts";
import { remoteEnvironmentModelSelection } from "./t3team-remoteEnvironmentTarget.ts";

const asSubagent = (lineage: OrchestrationV2AppThreadLineage): OrchestrationV2AppThreadLineage => ({
  ...lineage,
  parentThreadId: ThreadId.make("thread-parent"),
  relationshipToParent: "subagent",
});

const naming = (sessionId: string) =>
  remoteEnvironmentModelSelection({
    sessionId,
    modelSelection: { instanceId: ProviderInstanceId.make("nexplore"), model: "Standard" },
  });

const delegatedChild = {
  ...turn,
  appThread: { ...turn.appThread, lineage: asSubagent(turn.appThread.lineage) },
};

const server = (
  markers: CloudChildPlacementMarkers,
  ownSessions: ReadonlyArray<string> = ["run-41"],
) =>
  Effect.gen(function* () {
    const placements = yield* makeRemoteEnvironmentPlacements(markers);
    const authorize = makeRemoteEnvironmentAuthorizer({
      placements,
      ownSessionIds: Effect.succeed(ownSessions),
      registrationWait: "50 millis",
    });
    return { placements, authorize };
  });

const refusal = <A, E extends { readonly message: string }>(effect: Effect.Effect<A, E>) =>
  Effect.map(Effect.flip(effect), (error) => error.message);

describe("makeRemoteEnvironmentAuthorizer", () => {
  it.live("refuses a thread delegate_task did not place, whatever its options name", () =>
    Effect.gen(function* () {
      const { authorize } = yield* server(yield* makeMemoryCloudChildPlacementMarkers);
      assert.match(
        yield* refusal(authorize(turn)),
        /was not placed on a cloud session by delegate_task/,
      );
    }),
  );

  it.live("a placed child runs on its session with the key derived when it was placed", () =>
    Effect.gen(function* () {
      const { placements, authorize } = yield* server(yield* makeMemoryCloudChildPlacementMarkers);
      yield* placements.register(turn.threadId, { sessionId: "run-41", repositoryKey: REPOSITORY });
      assert.deepStrictEqual(yield* authorize(turn), {
        sessionId: "run-41",
        repositoryKey: REPOSITORY,
        modelSelection: { instanceId: ProviderInstanceId.make("nexplore"), model: "Standard" },
      });
    }),
  );

  it.live("a placed child whose options name another session is refused", () =>
    Effect.gen(function* () {
      const { placements, authorize } = yield* server(yield* makeMemoryCloudChildPlacementMarkers, [
        "run-41",
        "run-77",
      ]);
      yield* placements.register(turn.threadId, { sessionId: "run-41", repositoryKey: REPOSITORY });
      assert.match(
        yield* refusal(authorize({ ...turn, modelSelection: naming("run-77") })),
        /placed on cloud session run-41, not run-77/,
      );
    }),
  );

  it.live("waits for a registration that lands just after the run started", () =>
    Effect.gen(function* () {
      const placements = yield* makeRemoteEnvironmentPlacements(
        yield* makeMemoryCloudChildPlacementMarkers,
      );
      const authorize = makeRemoteEnvironmentAuthorizer({
        placements,
        ownSessionIds: Effect.succeed(["run-41"]),
        registrationWait: "5 seconds",
      });
      const pending = yield* Effect.forkChild(authorize(turn));
      yield* Effect.yieldNow;
      yield* placements.register(turn.threadId, { sessionId: "run-41", repositoryKey: REPOSITORY });
      assert.strictEqual((yield* Fiber.join(pending)).repositoryKey, REPOSITORY);
    }),
  );

  it.live("after a restart, a placed child resumes from its durable marker", () =>
    Effect.gen(function* () {
      const markers = yield* makeMemoryCloudChildPlacementMarkers;
      const before = yield* server(markers);
      yield* before.placements.register(delegatedChild.threadId, {
        sessionId: "run-41",
        repositoryKey: REPOSITORY,
      });
      const after = yield* server(markers);
      const grant = yield* after.authorize(delegatedChild);
      assert.strictEqual(grant.repositoryKey, REPOSITORY);
      assert.deepStrictEqual(yield* after.placements.lookup(delegatedChild.threadId, "1 millis"), {
        sessionId: "run-41",
        repositoryKey: REPOSITORY,
      });
    }),
  );

  it.live("after a restart, a never-placed subagent with a rewritten selection is refused", () =>
    Effect.gen(function* () {
      const { authorize } = yield* server(yield* makeMemoryCloudChildPlacementMarkers);
      assert.match(
        yield* refusal(authorize({ ...delegatedChild, modelSelection: naming("run-41") })),
        /was not placed on a cloud session by delegate_task/,
      );
    }),
  );

  it.live("after a restart, the marker must name the session and that session must be live", () =>
    Effect.gen(function* () {
      const markers = yield* makeMemoryCloudChildPlacementMarkers;
      yield* markers.record(delegatedChild.threadId, {
        sessionId: "run-41",
        repositoryKey: REPOSITORY,
      });
      const rewritten = yield* server(markers, ["run-41", "run-77"]);
      assert.match(
        yield* refusal(
          rewritten.authorize({ ...delegatedChild, modelSelection: naming("run-77") }),
        ),
        /placed on cloud session run-41, not run-77/,
      );
      const ended = yield* server(markers, ["run-99"]);
      assert.match(
        yield* refusal(ended.authorize(delegatedChild)),
        /run-41 is not one of your running sessions; this child's placement could not be re-established/,
      );
    }),
  );

  it.live("a session list the broker cannot give refuses the turn with the reason", () =>
    Effect.gen(function* () {
      const placements = yield* makeRemoteEnvironmentPlacements(
        yield* makeMemoryCloudChildPlacementMarkers,
      );
      yield* placements.register(turn.threadId, { sessionId: "run-41", repositoryKey: REPOSITORY });
      const authorize = makeRemoteEnvironmentAuthorizer({
        placements,
        ownSessionIds: Effect.fail({ message: "Sign in to Nexplore." }),
      });
      assert.match(
        yield* refusal(authorize(turn)),
        /Could not confirm the cloud session is yours: Sign in/,
      );
    }),
  );
});
