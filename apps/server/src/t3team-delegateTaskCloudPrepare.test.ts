import { assert, describe, it } from "@effect/vitest";
import {
  type CloudSession,
  type OrchestrationProjectShell,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { makeCloudSessionCapacity } from "./t3team-delegateCloudCapacity.ts";
import { prepareCloudChild } from "./t3team-delegateTaskCloudPrepare.ts";
import type { DelegateCloudSessions } from "./t3team-delegateTaskCloudSession.ts";
import { makeCloudSessionStartGuard } from "./t3team-delegateTaskCloudSessionStartGuard.ts";
import { remoteEnvironmentTargetOf } from "./t3team-remoteEnvironmentTarget.ts";

const AT = "2026-10-24T22:00:00.000Z";
const modelSelection = { instanceId: ProviderInstanceId.make("nexplore"), model: "Standard" };

const ready: CloudSession = {
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
};

const project = (withRepository: boolean): OrchestrationProjectShell => ({
  id: ProjectId.make("project:qa"),
  title: "nexi-machine-qa",
  workspaceRoot: "/Users/pj/nexi-machine-qa",
  ...(withRepository
    ? {
        repositoryIdentity: {
          canonicalKey: "nexplore.ghe.com/pj/nexi-machine-qa",
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

const sessions = (active: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const placement: DelegateCloudSessions = {
      list: Effect.succeed({ sessions: [ready], configured: true }),
      brokerReady: Effect.void,
      start: () => Effect.succeed({ ...ready, sessionId: "77", phase: "requested" }),
      probe: () => Effect.void,
      startGuard: yield* makeCloudSessionStartGuard(),
      capacity: yield* makeCloudSessionCapacity({
        limit: 1,
        isActive: (threadId) => Effect.succeed(active.includes(threadId)),
      }),
    };
    return placement;
  });

const prepare = (input: {
  readonly placement: DelegateCloudSessions;
  readonly withRepository?: boolean;
  readonly worktree?: boolean;
  readonly requestKey?: string;
}) =>
  prepareCloudChild({
    sessions: input.placement,
    request: { kind: "auto" },
    project: project(input.withRepository ?? true),
    workspace: input.worktree ? { isolation: "worktree" } : undefined,
    requestKey: input.requestKey ?? "request-1",
    modelSelection,
  });

describe("prepareCloudChild", () => {
  it.effect("routes the child to the session through the remote environment instance", () =>
    Effect.gen(function* () {
      const prepared = yield* prepare({ placement: yield* sessions([]) });
      assert.strictEqual(prepared.modelSelection.instanceId, "remoteEnvironment");
      assert.deepStrictEqual(remoteEnvironmentTargetOf(prepared.modelSelection), {
        sessionId: "41",
        repositoryKey: "nexplore.ghe.com/pj/nexi-machine-qa",
        modelSelection,
      });
      assert.match(
        prepared.note,
        /^The child runs on cloud session 'nexi-machine-qa' \(41\), which is ready/,
      );
    }),
  );

  it.effect("refuses workspace isolation and a project without a repository", () =>
    Effect.gen(function* () {
      const placement = yield* sessions([]);
      const isolated = yield* Effect.flip(prepare({ placement, worktree: true }));
      assert.match(isolated.message, /omit workspace isolation/);
      const plain = yield* Effect.flip(prepare({ placement, withRepository: false }));
      assert.match(plain.message, /needs a project with a repository/);
    }),
  );

  it.effect("a full session sends the next child to a new one; a released slot is free again", () =>
    Effect.gen(function* () {
      const placement = yield* sessions(["child-1"]);
      const first = yield* prepare({ placement, requestKey: "request-1" });
      yield* first.register(ThreadId.make("child-1"));
      const second = yield* prepare({ placement, requestKey: "request-2" });
      assert.strictEqual(remoteEnvironmentTargetOf(second.modelSelection)?.sessionId, "77");
      assert.match(second.note, /was started for it and is starting/);
      const freed = yield* sessions([]);
      const reserved = yield* prepare({ placement: freed, requestKey: "request-3" });
      yield* reserved.release;
      assert.isTrue(yield* freed.capacity.hasRoom("41"));
    }),
  );
});
