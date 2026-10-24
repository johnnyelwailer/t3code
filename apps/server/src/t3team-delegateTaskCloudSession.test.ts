import { assert, describe, it } from "@effect/vitest";
import {
  type CloudSession,
  CloudSessionFailedError,
  ProjectId,
  type RepositoryIdentity,
} from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";

import {
  CHILD_RUNS_HERE_NOTE,
  type CloudSessionPlacementInput,
  type DelegateCloudSessions,
  placeOnCloudSession,
} from "./t3team-delegateTaskCloudSession.ts";
import {
  CLOUD_SESSION_EXTENSION,
  childRepositoryOf,
  parseCloudSessionExtension,
  withCloudSessionExtension,
} from "./t3team-delegateTaskCloudSessionExtension.ts";
import { makeCloudSessionStartGuard } from "./t3team-delegateTaskCloudSessionStartGuard.ts";

const projectId = ProjectId.make("project:nexi");

const session = (overrides: Partial<CloudSession>): CloudSession => ({
  sessionId: "41",
  providerKind: "github_actions",
  phase: "ready",
  elapsedSeconds: 60,
  name: "nx-nexi",
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
  readonly start?: DelegateCloudSessions["start"];
}) =>
  Effect.map(makeCloudSessionStartGuard(), (startGuard) => ({
    list:
      input.list ??
      Effect.succeed({ sessions: input.sessions ?? [], configured: input.configured ?? true }),
    brokerReady: input.brokerReady ?? Effect.void,
    startGuard,
    ...(input.start === undefined ? {} : { start: input.start }),
  }));

const auto: CloudSessionPlacementInput = {
  request: { kind: "auto" },
  projectId,
  repository: "hive/nx-nexi",
  projectRepository: true,
};

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
    assert.strictEqual(parseCloudSessionExtension("  ").ok, false);
  });

  it("offers the extension only when the placement exists", () => {
    assert.deepStrictEqual(withCloudSessionExtension([], false), []);
    assert.deepStrictEqual(withCloudSessionExtension([], true), [CLOUD_SESSION_EXTENSION]);
  });
});

describe("childRepositoryOf", () => {
  const identity: RepositoryIdentity = {
    canonicalKey: "nexplore.ghe.com/hive/nx-nexi",
    locator: { source: "git-remote", remoteName: "origin", remoteUrl: "https://x/hive/nx-nexi" },
    owner: "hive",
    name: "nx-nexi",
  };

  it("uses the project's repository unless the worktree names another", () => {
    assert.deepStrictEqual(childRepositoryOf(identity, null), {
      repository: "hive/nx-nexi",
      projectRepository: true,
    });
    assert.deepStrictEqual(childRepositoryOf(identity, "Hive/NX-Nexi"), {
      repository: "Hive/NX-Nexi",
      projectRepository: true,
    });
    assert.deepStrictEqual(childRepositoryOf(identity, "hive/linked-lib"), {
      repository: "hive/linked-lib",
      projectRepository: false,
    });
    assert.deepStrictEqual(childRepositoryOf(null, null), {
      repository: null,
      projectRepository: true,
    });
  });
});

describe("placeOnCloudSession", () => {
  it.effect("auto names the fitting ready session and says the child runs here", () =>
    Effect.gen(function* () {
      const notes = yield* placeOnCloudSession(
        yield* fakeSessions({ sessions: [session({})] }),
        Effect.succeed(auto),
      );
      assert.deepStrictEqual(notes, [
        "Fitting cloud session 'nx-nexi' (41) is ready.",
        CHILD_RUNS_HERE_NOTE,
      ]);
    }),
  );

  it.effect("an auto miss only reports while starting is off", () =>
    Effect.gen(function* () {
      const notes = yield* placeOnCloudSession(
        yield* fakeSessions({ sessions: [session({ name: "other" })] }),
        Effect.succeed(auto),
      );
      assert.match(notes[0] ?? "", /a new one would be needed\. None was started/);
    }),
  );

  it.effect("new reports the broker sign-in problem instead of claiming a start", () =>
    Effect.gen(function* () {
      const notes = yield* placeOnCloudSession(
        yield* fakeSessions({ brokerReady: Effect.fail(signedOut) }),
        Effect.succeed({ ...auto, request: { kind: "new" } }),
      );
      assert.deepStrictEqual(notes, [
        "No cloud session was named (broker_sign_in_required): Sign in to Nexplore.",
        CHILD_RUNS_HERE_NOTE,
      ]);
    }),
  );

  it.effect("auto without a gh login says cloud sessions are not set up", () =>
    Effect.gen(function* () {
      const notes = yield* placeOnCloudSession(
        yield* fakeSessions({ configured: false }),
        Effect.succeed(auto),
      );
      assert.match(notes[0] ?? "", /not set up on this server/);
    }),
  );

  it.effect("a linked repository never starts a session for the project", () =>
    Effect.gen(function* () {
      const notes = yield* placeOnCloudSession(
        yield* fakeSessions({}),
        Effect.succeed({ ...auto, repository: "hive/linked-lib", projectRepository: false }),
      );
      assert.match(notes[0] ?? "", /none can be started for it/);
    }),
  );

  it.effect("an unexpected defect degrades to a note", () =>
    Effect.gen(function* () {
      const notes = yield* placeOnCloudSession(
        yield* fakeSessions({ list: Effect.die(new Error("boom")) }),
        Effect.succeed(auto),
      );
      assert.deepStrictEqual(notes, [
        "No cloud session was named: an unexpected error occurred while looking.",
        CHILD_RUNS_HERE_NOTE,
      ]);
    }),
  );

  it.effect("with starting on, concurrent auto misses start one session per project", () =>
    Effect.gen(function* () {
      const starts = yield* Ref.make(0);
      const started = yield* Deferred.make<void>();
      const sessions = yield* fakeSessions({
        start: () =>
          Ref.update(starts, (count) => count + 1).pipe(
            Effect.andThen(Deferred.succeed(started, undefined)),
            Effect.as(session({ sessionId: "99", phase: "requested" })),
          ),
      });
      const fibers = yield* Effect.forEach([1, 2, 3], () =>
        Effect.forkChild(placeOnCloudSession(sessions, Effect.succeed(auto))),
      );
      const notes = yield* Effect.forEach(fibers, Fiber.join);
      yield* Deferred.await(started);
      assert.strictEqual(yield* Ref.get(starts), 1);
      assert.strictEqual(
        notes.filter((each) => (each[0] ?? "").startsWith("Starting a new cloud session")).length,
        1,
      );
      assert.strictEqual(notes.filter((each) => /already starting/.test(each[0] ?? "")).length, 2);
    }),
  );

  it.effect("a failed start frees the project for the next delegation", () =>
    Effect.gen(function* () {
      const released = yield* Deferred.make<void>();
      const base = yield* fakeSessions({ start: () => Effect.fail(signedOut) });
      const sessions: DelegateCloudSessions = {
        ...base,
        startGuard: {
          claim: base.startGuard.claim,
          release: (id) =>
            base.startGuard.release(id).pipe(Effect.andThen(Deferred.succeed(released, undefined))),
        },
      };
      yield* placeOnCloudSession(sessions, Effect.succeed(auto));
      yield* Deferred.await(released);
      const claim = yield* sessions.startGuard.claim(projectId);
      assert.strictEqual(claim.claimed, true);
    }),
  );

  it.effect("a ready session whose environment is not linked yet is named as starting", () =>
    Effect.gen(function* () {
      const notes = yield* placeOnCloudSession(
        yield* fakeSessions({
          sessions: [session({ environmentId: undefined, endsAt: "2026-10-25T03:00:00.000Z" })],
        }),
        Effect.succeed(auto),
      );
      assert.strictEqual(
        notes[0],
        "Fitting cloud session 'nx-nexi' (41) is starting (its environment is not linked yet).",
      );
    }),
  );

  it.effect("a defect while resolving the input still ends in a note", () =>
    Effect.gen(function* () {
      const notes = yield* placeOnCloudSession(
        yield* fakeSessions({ sessions: [session({})] }),
        Effect.die(new Error("project lookup died")),
      );
      assert.deepStrictEqual(notes, [
        "No cloud session was named: an unexpected error occurred while looking.",
        CHILD_RUNS_HERE_NOTE,
      ]);
    }),
  );
});
