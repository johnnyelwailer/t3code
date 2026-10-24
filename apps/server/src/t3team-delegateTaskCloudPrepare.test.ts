import { assert, describe, it } from "@effect/vitest";
import { type OrchestrationProjectShell, ProjectId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";

import {
  cloudSession,
  fakeCloudSessions,
  MODEL,
  REPOSITORY_KEY,
} from "./t3team-delegateCloud.fixtures.ts";
import { prepareCloudChild } from "./t3team-delegateTaskCloudPrepare.ts";
import type { DelegateCloudSessions } from "./t3team-delegateTaskCloudTypes.ts";
import { remoteEnvironmentTargetOf } from "./t3team-remoteEnvironmentTarget.ts";

const AT = "2026-10-24T22:00:00.000Z";

const project = (withRepository: boolean): OrchestrationProjectShell => ({
  id: ProjectId.make("project:qa"),
  title: "nexi-machine-qa",
  workspaceRoot: "/Users/pj/nexi-machine-qa",
  ...(withRepository
    ? {
        repositoryIdentity: {
          canonicalKey: REPOSITORY_KEY,
          locator: { source: "git-remote", remoteName: "origin", remoteUrl: "https://x/qa" },
          name: "nexi-machine-qa",
        },
      }
    : {}),
  defaultModelSelection: null,
  scripts: [],
  createdAt: AT,
  updatedAt: AT,
});

const prepare = (input: {
  readonly sessions: DelegateCloudSessions;
  readonly request?: "auto" | "new";
  readonly withRepository?: boolean;
  readonly worktree?: boolean;
  readonly requestKey?: string;
}) =>
  prepareCloudChild({
    sessions: input.sessions,
    request: { kind: input.request ?? "auto" },
    project: project(input.withRepository ?? true),
    workspace: input.worktree ? { isolation: "worktree" } : undefined,
    requestKey: input.requestKey ?? "request-1",
    modelSelection: MODEL,
  });

describe("prepareCloudChild", () => {
  it.effect(
    "routes the child through the remote environment instance and registers it once created",
    () =>
      Effect.gen(function* () {
        const { sessions } = yield* fakeCloudSessions({ sessions: [cloudSession({})] });
        const prepared = yield* prepare({ sessions });
        assert.strictEqual(prepared.modelSelection.instanceId, "remoteEnvironment");
        assert.deepStrictEqual(remoteEnvironmentTargetOf(prepared.modelSelection), {
          sessionId: "41",
          modelSelection: MODEL,
        });
        assert.match(
          prepared.note,
          /^The child runs on cloud session 'nexi-machine-qa' \(41\), which is ready/,
        );
        yield* prepared.register(ThreadId.make("child-1"));
        assert.deepStrictEqual(
          yield* sessions.placements.lookup(ThreadId.make("child-1"), "1 millis"),
          {
            sessionId: "41",
            repositoryKey: REPOSITORY_KEY,
          },
        );
      }),
  );

  it.effect("refuses workspace isolation and a project without a repository", () =>
    Effect.gen(function* () {
      const { sessions } = yield* fakeCloudSessions({ sessions: [cloudSession({})] });
      const isolated = yield* Effect.flip(prepare({ sessions, worktree: true }));
      assert.match(isolated.message, /omit workspace isolation/);
      const plain = yield* Effect.flip(prepare({ sessions, withRepository: false }));
      assert.match(plain.message, /needs a project with a repository/);
    }),
  );

  it.effect("sequential retries of one request key place and start once, with the same note", () =>
    Effect.gen(function* () {
      const { sessions, starts } = yield* fakeCloudSessions({ limit: 1 });
      const first = yield* prepare({ sessions, request: "new" });
      const second = yield* prepare({ sessions, request: "new" });
      const third = yield* prepare({ sessions, request: "new" });
      assert.strictEqual(yield* Ref.get(starts), 1);
      assert.strictEqual(second.note, first.note);
      assert.deepStrictEqual(third.modelSelection, first.modelSelection);
      yield* second.release;
      yield* third.release;
      assert.isFalse(yield* sessions.capacity.tryReserve("another", "99"));
    }),
  );

  it.effect("concurrent retries of one request key place and start once", () =>
    Effect.gen(function* () {
      const { sessions, starts } = yield* fakeCloudSessions({});
      const fibers = yield* Effect.forEach([1, 2, 3], () =>
        Effect.forkChild(prepare({ sessions, request: "new" })),
      );
      const prepared = yield* Effect.forEach(fibers, Fiber.join);
      assert.strictEqual(yield* Ref.get(starts), 1);
      assert.strictEqual(new Set(prepared.map((each) => each.note)).size, 1);
    }),
  );

  it.effect("the request that placed it frees the slot when no child was created", () =>
    Effect.gen(function* () {
      const { sessions } = yield* fakeCloudSessions({ sessions: [cloudSession({})], limit: 1 });
      const prepared = yield* prepare({ sessions });
      assert.isFalse(yield* sessions.capacity.tryReserve("other", "41"));
      yield* prepared.release;
      assert.isTrue(yield* sessions.capacity.tryReserve("other", "41"));
    }),
  );
});
