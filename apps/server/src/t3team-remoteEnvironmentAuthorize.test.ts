import { assert, describe, it } from "@effect/vitest";
import {
  type OrchestrationV2AppThreadLineage,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";

import { makeRemoteEnvironmentAuthorizer } from "./t3team-remoteEnvironmentAuthorize.ts";
import { makeRemoteEnvironmentPlacements } from "./t3team-remoteEnvironmentPlacements.ts";
import { REPOSITORY, turn } from "./t3team-remoteEnvironmentSession.fixtures.ts";
import { remoteEnvironmentModelSelection } from "./t3team-remoteEnvironmentTarget.ts";

const asSubagent = (lineage: OrchestrationV2AppThreadLineage): OrchestrationV2AppThreadLineage => ({
  ...lineage,
  parentThreadId: ThreadId.make("thread-parent"),
  relationshipToParent: "subagent",
});

const delegatedChild = {
  ...turn,
  appThread: { ...turn.appThread, lineage: asSubagent(turn.appThread.lineage) },
};

const naming = (sessionId: string) => ({
  ...delegatedChild,
  modelSelection: remoteEnvironmentModelSelection({
    sessionId,
    modelSelection: { instanceId: ProviderInstanceId.make("nexplore"), model: "Standard" },
  }),
});

const setup = (input: {
  readonly ownSessions?: ReadonlyArray<string>;
  readonly checkoutKey?: string | null;
}) =>
  Effect.gen(function* () {
    const placements = yield* makeRemoteEnvironmentPlacements;
    const authorize = makeRemoteEnvironmentAuthorizer({
      placements,
      ownSessionIds: Effect.succeed(input.ownSessions ?? ["run-41"]),
      repositoryKeyOf: () =>
        Effect.succeed(input.checkoutKey === undefined ? REPOSITORY : input.checkoutKey),
      registrationWait: "50 millis",
    });
    return { placements, authorize };
  });

const refusal = <A, E extends { readonly message: string }>(effect: Effect.Effect<A, E>) =>
  Effect.map(Effect.flip(effect), (error) => error.message);

describe("makeRemoteEnvironmentAuthorizer", () => {
  it.live("refuses a thread delegate_task did not place, whatever its options name", () =>
    Effect.gen(function* () {
      const { authorize } = yield* setup({});
      assert.match(
        yield* refusal(authorize(turn)),
        /was not placed on a cloud session by delegate_task/,
      );
    }),
  );

  it.live("a placed child runs on its session with the key derived when it was placed", () =>
    Effect.gen(function* () {
      const { placements, authorize } = yield* setup({ checkoutKey: "nexplore.ghe.com/foo/other" });
      yield* placements.register(turn.threadId, { sessionId: "run-41", repositoryKey: REPOSITORY });
      const grant = yield* authorize(turn);
      assert.deepStrictEqual(grant, {
        sessionId: "run-41",
        repositoryKey: REPOSITORY,
        modelSelection: { instanceId: ProviderInstanceId.make("nexplore"), model: "Standard" },
      });
    }),
  );

  it.live("a placed child whose options name another session is refused", () =>
    Effect.gen(function* () {
      const { placements, authorize } = yield* setup({ ownSessions: ["run-41", "run-77"] });
      yield* placements.register(turn.threadId, { sessionId: "run-41", repositoryKey: REPOSITORY });
      assert.match(
        yield* refusal(authorize(naming("run-77"))),
        /placed on cloud session run-41, not run-77/,
      );
    }),
  );

  it.live("waits for a registration that lands just after the run started", () =>
    Effect.gen(function* () {
      const placements = yield* makeRemoteEnvironmentPlacements;
      const authorize = makeRemoteEnvironmentAuthorizer({
        placements,
        ownSessionIds: Effect.succeed(["run-41"]),
        repositoryKeyOf: () => Effect.succeed(null),
        registrationWait: "5 seconds",
      });
      const pending = yield* Effect.forkChild(authorize(turn));
      yield* Effect.yieldNow;
      yield* placements.register(turn.threadId, { sessionId: "run-41", repositoryKey: REPOSITORY });
      const grant = yield* Fiber.join(pending);
      assert.strictEqual(grant.repositoryKey, REPOSITORY);
    }),
  );

  it.live("after a restart, a delegated child is re-established from its own checkout", () =>
    Effect.gen(function* () {
      const { placements, authorize } = yield* setup({});
      const grant = yield* authorize(delegatedChild);
      assert.strictEqual(grant.repositoryKey, REPOSITORY);
      assert.deepStrictEqual(yield* placements.lookup(delegatedChild.threadId, "1 millis"), {
        sessionId: "run-41",
        repositoryKey: REPOSITORY,
      });
    }),
  );

  it.live(
    "after a restart, a session that is not the owner's, or an unknown checkout, is refused",
    () =>
      Effect.gen(function* () {
        const foreign = yield* setup({ ownSessions: ["run-99"] });
        assert.match(
          yield* refusal(foreign.authorize(delegatedChild)),
          /run-41 is not one of your running sessions; this child's placement could not be re-established/,
        );
        const unknown = yield* setup({ checkoutKey: null });
        assert.match(
          yield* refusal(unknown.authorize(delegatedChild)),
          /no repository identity on this server/,
        );
      }),
  );

  it.live("a session list the broker cannot give refuses the turn with the reason", () =>
    Effect.gen(function* () {
      const placements = yield* makeRemoteEnvironmentPlacements;
      yield* placements.register(turn.threadId, { sessionId: "run-41", repositoryKey: REPOSITORY });
      const authorize = makeRemoteEnvironmentAuthorizer({
        placements,
        ownSessionIds: Effect.fail({ message: "Sign in to Nexplore." }),
        repositoryKeyOf: () => Effect.succeed(REPOSITORY),
      });
      assert.match(
        yield* refusal(authorize(turn)),
        /Could not confirm the cloud session is yours: Sign in/,
      );
    }),
  );
});
