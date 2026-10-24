import { assert, describe, it } from "@effect/vitest";
import {
  type CloudSession,
  CloudSessionFailedError,
  type CloudSessionCreateInput,
  ProjectId,
} from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";

import {
  CHILD_RUNS_HERE_NOTE,
  parseCloudSessionExtension,
  placeOnCloudSession,
  type DelegateCloudSessions,
} from "./t3team-delegateTaskCloudSession.ts";

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

const fakeSessions = (input: {
  readonly sessions: ReadonlyArray<CloudSession>;
  readonly created?: Deferred.Deferred<CloudSessionCreateInput>;
  readonly listError?: CloudSessionFailedError;
}): DelegateCloudSessions => ({
  list:
    input.listError === undefined
      ? Effect.succeed({ sessions: input.sessions, configured: true })
      : Effect.fail(input.listError),
  create: (request) =>
    (input.created === undefined ? Effect.void : Deferred.succeed(input.created, request)).pipe(
      Effect.as(session({ sessionId: "99", phase: "requested" })),
    ),
});

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
});

describe("placeOnCloudSession", () => {
  it.effect("auto names the fitting ready session and says the child runs here", () =>
    Effect.gen(function* () {
      const notes = yield* placeOnCloudSession(fakeSessions({ sessions: [session({})] }), {
        request: { kind: "auto" },
        projectId,
        repositoryName: "nx-nexi",
      });
      assert.deepStrictEqual(notes, [
        "Fitting cloud session 'nx-nexi' (41) is ready.",
        CHILD_RUNS_HERE_NOTE,
      ]);
    }),
  );

  it.effect("auto starts a session for the project when none fits", () =>
    Effect.gen(function* () {
      const created = yield* Deferred.make<CloudSessionCreateInput>();
      const notes = yield* placeOnCloudSession(
        fakeSessions({ sessions: [session({ name: "other" })], created }),
        { request: { kind: "auto" }, projectId, repositoryName: "nx-nexi" },
      );
      assert.match(notes[0] ?? "", /^Starting a new cloud session/);
      const request = yield* Deferred.await(created);
      assert.strictEqual(request.projectId, projectId);
    }),
  );

  it.effect("a named session that is not listed starts nothing", () =>
    Effect.gen(function* () {
      const notes = yield* placeOnCloudSession(fakeSessions({ sessions: [session({})] }), {
        request: { kind: "session", sessionId: "7" },
        projectId,
        repositoryName: "nx-nexi",
      });
      assert.strictEqual(
        notes[0],
        "Cloud session 7 is not in your session list; nothing was started.",
      );
    }),
  );

  it.effect("a broker sign-in problem becomes a note, never a failure", () =>
    Effect.gen(function* () {
      const notes = yield* placeOnCloudSession(
        fakeSessions({
          sessions: [],
          listError: new CloudSessionFailedError({
            reason: "broker_sign_in_required",
            message: "Sign in to Nexplore.",
          }),
        }),
        { request: { kind: "auto" }, projectId, repositoryName: "nx-nexi" },
      );
      assert.deepStrictEqual(notes, [
        "No cloud session was used (broker_sign_in_required): Sign in to Nexplore.",
        CHILD_RUNS_HERE_NOTE,
      ]);
    }),
  );
});
