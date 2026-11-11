import { assert, describe, it } from "@effect/vitest";
import { CloudSessionFailedError, type CloudSessionDeleteInfo } from "@t3tools/contracts";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import { afterEach } from "vite-plus/test";

import { isMcpToolEnabled } from "../t3team/t3team-mcpToolFeatureGate.ts";
import { deleteCloudSessionForCaller } from "./t3team-cloudSessionDelete.ts";

const info = (snapshotOnlyProjects: CloudSessionDeleteInfo["snapshotOnlyProjects"] = null) =>
  ({
    repository: "acme/api",
    projects: ["api"],
    otherSessions: 0,
    snapshotOnlyProjects,
  }) satisfies CloudSessionDeleteInfo;

const sessionsFor = (owned: boolean) => {
  const calls: string[] = [];
  const missing = new CloudSessionFailedError({
    reason: "unknown_session",
    message: "That session does not exist.",
  });
  return {
    calls,
    sessions: {
      deleteInfo: ({ sessionId }: { sessionId: string }) => {
        calls.push(`info:${sessionId}`);
        return owned ? Effect.succeed(info()) : Effect.fail(missing);
      },
      delete: ({ sessionId }: { sessionId: string }) => {
        calls.push(`delete:${sessionId}`);
        return Effect.succeed({ wipBranch: "wip/nexi-ws-111", warnings: [] as const });
      },
    },
  };
};

describe("cloud_session_delete", () => {
  afterEach(() => replaceFeatureFlagPresetValues(new Map()));

  it("is not offered while CLOUD_SESSION_STOP_DELETE is off", () => {
    assert.isFalse(isMcpToolEnabled("cloud_session_delete"));
    replaceFeatureFlagPresetValues(new Map([["CLOUD_SESSION_STOP_DELETE", true]]));
    assert.isTrue(isMcpToolEnabled("cloud_session_delete"));
  });

  it.effect("refuses the call while the flag is off and does not delete", () =>
    Effect.gen(function* () {
      const { calls, sessions } = sessionsFor(true);
      const error = yield* Effect.flip(deleteCloudSessionForCaller(sessions, { sessionId: "111" }));
      assert.include(error.message, "Stop and delete cloud sessions");
      assert.include(error.message, "turned off");
      assert.deepEqual(calls, []);
    }),
  );

  it.effect("deletes a session this user started", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([["CLOUD_SESSION_STOP_DELETE", true]]));
      const { calls, sessions } = sessionsFor(true);
      const result = yield* deleteCloudSessionForCaller(sessions, { sessionId: "111" });
      assert.equal(result.wipBranch, "wip/nexi-ws-111");
      assert.deepEqual(calls, ["info:111", "delete:111"]);
    }),
  );

  it.effect("refuses a session this user did not start", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([["CLOUD_SESSION_STOP_DELETE", true]]));
      const { calls, sessions } = sessionsFor(false);
      const error = yield* Effect.flip(deleteCloudSessionForCaller(sessions, { sessionId: "222" }));
      assert.equal(
        error.message,
        "That cloud session is not one this user started, so it was not deleted.",
      );
      assert.deepEqual(calls, ["info:222"]);
    }),
  );

  it.effect("does not delete until snapshot-only projects are named", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([["CLOUD_SESSION_STOP_DELETE", true]]));
      const calls: string[] = [];
      const sessions = {
        deleteInfo: () => {
          calls.push("info");
          return Effect.succeed(info(["notes"]));
        },
        delete: () => {
          calls.push("delete");
          return Effect.succeed({ wipBranch: null, warnings: [] as const });
        },
      };
      const error = yield* Effect.flip(deleteCloudSessionForCaller(sessions, { sessionId: "111" }));
      assert.include(error.message, "notes");
      assert.include(error.message, "Nothing was deleted");
      assert.deepEqual(calls, ["info"]);
      calls.length = 0;
      yield* deleteCloudSessionForCaller(sessions, {
        sessionId: "111",
        acknowledgedProjects: ["notes"],
      });
      assert.deepEqual(calls, ["info", "delete"]);
    }),
  );
});
