import { assert, describe, it } from "@effect/vitest";
import { type CloudSession, ThreadId } from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";

import {
  autoInput,
  cloudSession,
  fakeCloudSessions,
  signedOut,
} from "./t3team-delegateCloud.fixtures.ts";
import { placeOnCloudSession } from "./t3team-delegateTaskCloudSession.ts";
import {
  CLOUD_SESSION_EXTENSION,
  parseCloudSessionExtension,
  withCloudSessionExtension,
} from "./t3team-delegateTaskCloudSessionExtension.ts";
import type { CloudSessionPlacement } from "./t3team-delegateTaskCloudTypes.ts";
import { RemoteEnvironmentRejected } from "./t3team-remoteEnvironmentPrepare.ts";

const ENDED_PHASES: ReadonlyArray<CloudSession["phase"]> = ["failed", "stopped", "cancelled"];

const placedId = (placement: CloudSessionPlacement) =>
  placement.kind === "placed" ? placement.session.sessionId : null;

const reasonOf = (placement: CloudSessionPlacement) =>
  placement.kind === "unplaced" ? placement.reason : "";

describe("parseCloudSessionExtension", () => {
  it("reads auto, new and a session id, and rejects anything else", () => {
    assert.deepStrictEqual(parseCloudSessionExtension("auto"), {
      ok: true,
      value: { kind: "auto" },
    });
    assert.deepStrictEqual(parseCloudSessionExtension(" new "), {
      ok: true,
      value: { kind: "new" },
    });
    assert.deepStrictEqual(parseCloudSessionExtension("123"), {
      ok: true,
      value: { kind: "session", sessionId: "123" },
    });
    assert.deepStrictEqual(parseCloudSessionExtension(undefined), { ok: true, value: undefined });
    assert.strictEqual(parseCloudSessionExtension(42).ok, false);
  });

  it("offers the extension only when the placement exists, stating the attachments limit", () => {
    assert.deepStrictEqual(withCloudSessionExtension([], false), []);
    assert.deepStrictEqual(withCloudSessionExtension([], true), [CLOUD_SESSION_EXTENSION]);
    assert.match(CLOUD_SESSION_EXTENSION.description, /attachments are refused/);
  });
});

describe("placeOnCloudSession", () => {
  it.effect("auto places the child on a ready fitting session that passes the probe", () =>
    Effect.gen(function* () {
      const { sessions, starts } = yield* fakeCloudSessions({ sessions: [cloudSession({})] });
      const placement = yield* placeOnCloudSession(sessions, autoInput());
      assert.isTrue(placement.kind === "placed" && placement.ready && !placement.started);
      assert.strictEqual(placedId(placement), "41");
      assert.strictEqual(yield* Ref.get(starts), 0);
    }),
  );

  it.effect("skips a ready session whose own project is another repository", () =>
    Effect.gen(function* () {
      const { sessions } = yield* fakeCloudSessions({
        sessions: [
          cloudSession({ sessionId: "41" }),
          cloudSession({
            sessionId: "42",
            phase: "starting",
            environmentId: undefined,
            endsAt: undefined,
          }),
        ],
        probe: (sessionId) =>
          sessionId === "41"
            ? Effect.fail(new RemoteEnvironmentRejected({ reason: "project", message: "other" }))
            : Effect.void,
      });
      const placement = yield* placeOnCloudSession(sessions, autoInput());
      assert.strictEqual(placedId(placement), "42");
      assert.isTrue(placement.kind === "placed" && !placement.ready);
      assert.isTrue(yield* sessions.capacity.tryReserve("other", "41"));
    }),
  );

  it.effect(
    "fails the placement when the session does not offer the model, and frees the slot",
    () =>
      Effect.gen(function* () {
        const { sessions } = yield* fakeCloudSessions({
          sessions: [cloudSession({})],
          limit: 1,
          probe: () =>
            Effect.fail(
              new RemoteEnvironmentRejected({
                reason: "model",
                message: "Model 'Standard' is not available.",
              }),
            ),
        });
        assert.deepStrictEqual(yield* placeOnCloudSession(sessions, autoInput()), {
          kind: "unplaced",
          reason: "Model 'Standard' is not available.",
        });
        assert.isTrue(yield* sessions.capacity.tryReserve("next", "41"));
      }),
  );

  it.effect("a probe that dies frees the slot it held", () =>
    Effect.gen(function* () {
      const { sessions } = yield* fakeCloudSessions({
        sessions: [cloudSession({})],
        limit: 1,
        probe: () => Effect.die(new Error("probe died")),
      });
      assert.match(
        reasonOf(yield* placeOnCloudSession(sessions, autoInput())),
        /unexpected error occurred while choosing a cloud session/,
      );
      assert.isTrue(yield* sessions.capacity.tryReserve("next", "41"));
    }),
  );

  it.effect("refuses an explicitly named session that has ended, for each ended phase", () =>
    Effect.gen(function* () {
      for (const phase of ENDED_PHASES) {
        const { sessions, starts } = yield* fakeCloudSessions({
          sessions: [cloudSession({ sessionId: "7", phase, environmentId: undefined })],
        });
        const placement = yield* placeOnCloudSession(sessions, {
          ...autoInput(),
          request: { kind: "session", sessionId: "7" },
        });
        assert.strictEqual(
          reasonOf(placement),
          `Cloud session 7 has ended (${phase}); name a running session or use 'auto'.`,
        );
        assert.strictEqual(yield* Ref.get(starts), 0);
      }
    }),
  );

  it.effect("a full session is passed over, and a new one is started when none has room", () =>
    Effect.gen(function* () {
      const { sessions, starts } = yield* fakeCloudSessions({
        sessions: [cloudSession({})],
        limit: 1,
        active: ["child-1"],
      });
      yield* sessions.capacity.tryReserve("earlier", "41");
      yield* sessions.capacity.register("earlier", ThreadId.make("child-1"));
      const placement = yield* placeOnCloudSession(sessions, autoInput());
      assert.isTrue(placement.kind === "placed" && placement.started);
      assert.strictEqual(placedId(placement), "99");
      assert.strictEqual(yield* Ref.get(starts), 1);
    }),
  );

  it.effect("five concurrent delegations against a limit of 3 put exactly 3 on the session", () =>
    Effect.gen(function* () {
      const gate = yield* Deferred.make<void>();
      const { sessions, starts } = yield* fakeCloudSessions({
        sessions: [cloudSession({})],
        limit: 3,
        probe: () => Deferred.await(gate),
      });
      const fibers = yield* Effect.forEach([1, 2, 3, 4, 5], (index) =>
        Effect.forkChild(placeOnCloudSession(sessions, autoInput(`request-${index}`))),
      );
      yield* Effect.yieldNow;
      yield* Deferred.succeed(gate, undefined);
      const placements = yield* Effect.forEach(fibers, Fiber.join);
      assert.strictEqual(placements.filter((each) => placedId(each) === "41").length, 3);
      assert.strictEqual(yield* Ref.get(starts), 1);
      assert.isFalse(yield* sessions.capacity.tryReserve("request-6", "41"));
    }),
  );

  it.effect("a start that is not listed yet does not place the child", () =>
    Effect.gen(function* () {
      const { sessions } = yield* fakeCloudSessions({
        started: cloudSession({ sessionId: "pending:qa.s1", phase: "requested" }),
      });
      const placement = yield* placeOnCloudSession(sessions, {
        ...autoInput(),
        request: { kind: "new" },
      });
      assert.match(reasonOf(placement), /not listed yet/);
    }),
  );

  it.effect("a signed-out broker, no gh login, an unknown id and a defect become reasons", () =>
    Effect.gen(function* () {
      const out = yield* fakeCloudSessions({ brokerReady: Effect.fail(signedOut) });
      assert.strictEqual(
        reasonOf(yield* placeOnCloudSession(out.sessions, autoInput())),
        "Sign in to Nexplore. (broker_sign_in_required)",
      );
      const none = yield* fakeCloudSessions({ configured: false });
      assert.match(reasonOf(yield* placeOnCloudSession(none.sessions, autoInput())), /not set up/);
      const listed = yield* fakeCloudSessions({ sessions: [cloudSession({})] });
      assert.match(
        reasonOf(
          yield* placeOnCloudSession(listed.sessions, {
            ...autoInput(),
            request: { kind: "session", sessionId: "7" },
          }),
        ),
        /not in your session list/,
      );
      const broken = yield* fakeCloudSessions({ list: Effect.die(new Error("boom")) });
      assert.match(
        reasonOf(yield* placeOnCloudSession(broken.sessions, autoInput())),
        /unexpected error occurred while choosing a cloud session/,
      );
    }),
  );
});
