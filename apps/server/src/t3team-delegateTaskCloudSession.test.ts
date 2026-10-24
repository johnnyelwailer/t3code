import { assert, describe, it } from "@effect/vitest";
import {
  type CloudSession,
  CloudSessionFailedError,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";

import { makeCloudSessionCapacity } from "./t3team-delegateCloudCapacity.ts";
import {
  type CloudSessionPlacement,
  type CloudSessionPlacementInput,
  type DelegateCloudSessions,
  placeOnCloudSession,
} from "./t3team-delegateTaskCloudSession.ts";
import { makeCloudSessionStartGuard } from "./t3team-delegateTaskCloudSessionStartGuard.ts";
import {
  CLOUD_SESSION_EXTENSION,
  parseCloudSessionExtension,
  withCloudSessionExtension,
} from "./t3team-delegateTaskCloudSessionExtension.ts";
import { RemoteEnvironmentRejected } from "./t3team-remoteEnvironmentPrepare.ts";

const projectId = ProjectId.make("project:qa");

const session = (overrides: Partial<CloudSession>): CloudSession => ({
  sessionId: "41",
  providerKind: "github_actions",
  phase: "ready",
  elapsedSeconds: 60,
  name: "nexi-machine-qa",
  remainingSeconds: 4 * 3600,
  machineLabel: "ubuntu",
  failureReason: null,
  detailsUrl: null,
  environmentId: "env-41",
  transport: "nexi_broker",
  ...overrides,
});

const signedOut = new CloudSessionFailedError({
  reason: "broker_sign_in_required",
  message: "Sign in to Nexplore.",
});

const fakeSessions = (input: {
  readonly sessions?: ReadonlyArray<CloudSession>;
  readonly configured?: boolean;
  readonly brokerReady?: Effect.Effect<void, CloudSessionFailedError>;
  readonly list?: DelegateCloudSessions["list"];
  readonly probe?: DelegateCloudSessions["probe"];
  readonly started?: CloudSession;
  readonly limit?: number;
  readonly active?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const starts = yield* Ref.make(0);
    const capacity = yield* makeCloudSessionCapacity({
      limit: input.limit ?? 3,
      isActive: (threadId) => Effect.succeed((input.active ?? []).includes(threadId)),
    });
    const sessions: DelegateCloudSessions = {
      list:
        input.list ??
        Effect.succeed({ sessions: input.sessions ?? [], configured: input.configured ?? true }),
      brokerReady: input.brokerReady ?? Effect.void,
      start: () =>
        Ref.update(starts, (count) => count + 1).pipe(
          Effect.as(input.started ?? session({ sessionId: "99", phase: "requested" })),
        ),
      probe: input.probe ?? (() => Effect.void),
      startGuard: yield* makeCloudSessionStartGuard(),
      capacity,
    };
    return { sessions, starts };
  });

const auto: CloudSessionPlacementInput = {
  request: { kind: "auto" },
  projectId,
  repositoryName: "nexi-machine-qa",
  repositoryKey: "nexplore.ghe.com/pj/nexi-machine-qa",
  modelSelection: { instanceId: ProviderInstanceId.make("nexplore"), model: "Standard" },
};

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

  it("offers the extension only when the placement exists", () => {
    assert.deepStrictEqual(withCloudSessionExtension([], false), []);
    assert.deepStrictEqual(withCloudSessionExtension([], true), [CLOUD_SESSION_EXTENSION]);
  });
});

describe("placeOnCloudSession", () => {
  it.effect("auto places the child on a ready fitting session that passes the probe", () =>
    Effect.gen(function* () {
      const { sessions, starts } = yield* fakeSessions({ sessions: [session({})] });
      const placement = yield* placeOnCloudSession(sessions, auto);
      assert.isTrue(placement.kind === "placed" && placement.ready && !placement.started);
      assert.strictEqual(placedId(placement), "41");
      assert.strictEqual(yield* Ref.get(starts), 0);
    }),
  );

  it.effect("skips a ready session whose own project is another repository", () =>
    Effect.gen(function* () {
      const { sessions } = yield* fakeSessions({
        sessions: [
          session({ sessionId: "41" }),
          session({
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
      const placement = yield* placeOnCloudSession(sessions, auto);
      assert.strictEqual(placedId(placement), "42");
      assert.isTrue(placement.kind === "placed" && !placement.ready);
    }),
  );

  it.effect("fails the placement when the session does not offer the model", () =>
    Effect.gen(function* () {
      const { sessions } = yield* fakeSessions({
        sessions: [session({})],
        probe: () =>
          Effect.fail(
            new RemoteEnvironmentRejected({
              reason: "model",
              message: "Model 'Standard' is not available.",
            }),
          ),
      });
      assert.deepStrictEqual(yield* placeOnCloudSession(sessions, auto), {
        kind: "unplaced",
        reason: "Model 'Standard' is not available.",
      });
    }),
  );

  it.effect("a full session is passed over, and a new one is started when none has room", () =>
    Effect.gen(function* () {
      const { sessions, starts } = yield* fakeSessions({
        sessions: [session({})],
        limit: 1,
        active: ["child-1"],
      });
      yield* sessions.capacity.reserve("earlier", "41");
      yield* sessions.capacity.register("earlier", ThreadId.make("child-1"));
      const placement = yield* placeOnCloudSession(sessions, auto);
      assert.isTrue(placement.kind === "placed" && placement.started);
      assert.strictEqual(placedId(placement), "99");
      assert.strictEqual(yield* Ref.get(starts), 1);
    }),
  );

  it.effect("concurrent misses start one session; the others are told it is starting", () =>
    Effect.gen(function* () {
      const { sessions, starts } = yield* fakeSessions({});
      const fibers = yield* Effect.forEach([1, 2, 3], () =>
        Effect.forkChild(placeOnCloudSession(sessions, auto)),
      );
      const placements = yield* Effect.forEach(fibers, Fiber.join);
      assert.strictEqual(yield* Ref.get(starts), 1);
      assert.strictEqual(placements.filter((each) => each.kind === "placed").length, 1);
      assert.isTrue(placements.some((each) => /already starting/.test(reasonOf(each))));
    }),
  );

  it.effect("a start that is not listed yet does not place the child", () =>
    Effect.gen(function* () {
      const { sessions } = yield* fakeSessions({
        started: session({ sessionId: "pending:qa.s1", phase: "requested" }),
      });
      const placement = yield* placeOnCloudSession(sessions, { ...auto, request: { kind: "new" } });
      assert.match(reasonOf(placement), /not listed yet/);
    }),
  );

  it.effect("a signed-out broker, no gh login, an unknown id and a defect become reasons", () =>
    Effect.gen(function* () {
      const out = yield* fakeSessions({ brokerReady: Effect.fail(signedOut) });
      assert.strictEqual(
        reasonOf(yield* placeOnCloudSession(out.sessions, auto)),
        "Sign in to Nexplore. (broker_sign_in_required)",
      );
      const none = yield* fakeSessions({ configured: false });
      assert.match(reasonOf(yield* placeOnCloudSession(none.sessions, auto)), /not set up/);
      const listed = yield* fakeSessions({ sessions: [session({})] });
      assert.match(
        reasonOf(
          yield* placeOnCloudSession(listed.sessions, {
            ...auto,
            request: { kind: "session", sessionId: "7" },
          }),
        ),
        /not in your session list/,
      );
      const broken = yield* fakeSessions({ list: Effect.die(new Error("boom")) });
      assert.match(reasonOf(yield* placeOnCloudSession(broken.sessions, auto)), /unexpected error/);
    }),
  );
});
