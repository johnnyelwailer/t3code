/**
 * A Jira session that dies while the mirror loop runs must not go silent: the loop's failed walk
 * is recorded in the mirror state, the account is flagged needs-reconnect, and the digest reads
 * that flag — without a duplicate "session expired" sync error that would outlive signing back in.
 */
import { assert, it } from "@effect/vitest";
import { AtlassianAuthError, jiraCloudApiBaseUrl } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { afterEach } from "vite-plus/test";

import { layerMemory } from "./persistence/Sqlite.ts";
import {
  accountNeedsReconnect,
  ATLASSIAN_SESSION_EXPIRED_MESSAGE,
  setAccountNeedsReconnect,
} from "./t3team-atlassian-auth-staleToken.ts";
import { replaceAtlassianAuths } from "./t3team-atlassian-auth-store.ts";
import { runMirrorLoop } from "./t3team-atlassian-mirrorSyncLoop.ts";
import type { MirrorPageSource } from "./t3team-atlassian-mirrorSyncPageWalk.ts";
import { readT3TeamMirrorSyncStatus } from "./t3team-atlassian-mirrorSyncState.ts";
import { readDigestJiraHealth } from "./t3team-myworkDigestJiraHealth.ts";

const cloudId = "cloud-dead-session";
const account = { id: cloudId, provider: "atlassian" };
const project = { account, externalProjectId: "IES" };
const identity = { provider: "atlassian", accountId: cloudId, externalProjectId: "IES" };

afterEach(() => {
  replaceAtlassianAuths([]);
});

const revokedJira: MirrorPageSource = {
  listProjectMirrorPage: () =>
    Promise.reject(
      new AtlassianAuthError({
        message: "Authentication failed",
        path: "/rest/api/3/search/jql",
        status: 401,
        baseUrl: jiraCloudApiBaseUrl(cloudId),
      }),
    ),
};

const untilFailureRecorded = Effect.gen(function* () {
  let status = yield* readT3TeamMirrorSyncStatus(identity);
  for (let step = 0; step < 200 && status.lastError === undefined; step++) {
    yield* TestClock.withLive(Effect.sleep("0 millis"));
    status = yield* readT3TeamMirrorSyncStatus(identity);
  }
  return status;
});

it.effect("a session revoked mid-loop is recorded and surfaces as needs-reconnect", () =>
  Effect.gen(function* () {
    replaceAtlassianAuths([
      {
        accountId: cloudId,
        auth: { kind: "oauth", cloudId, siteUrl: "https://dead.atlassian.net", accessToken: "t" },
      },
    ]);
    let stopped = false;
    const loop = yield* Effect.forkChild(
      runMirrorLoop(project, "dead-session-loop", () => stopped, () => Effect.succeed(revokedJira)),
    );

    const status = yield* untilFailureRecorded;
    stopped = true;
    yield* Fiber.interrupt(loop);

    assert.strictEqual(status.lastError, ATLASSIAN_SESSION_EXPIRED_MESSAGE);
    assert.isTrue(accountNeedsReconnect(cloudId));
    const health = yield* readDigestJiraHealth(project);
    assert.strictEqual(health.jiraAuth, "needs-reconnect");
    assert.isUndefined(health.jiraSyncError);

    setAccountNeedsReconnect(cloudId, false);
    const afterSignIn = yield* readDigestJiraHealth(project);
    assert.strictEqual(afterSignIn.jiraAuth, "ok");
    assert.isUndefined(afterSignIn.jiraSyncError, "a signed-in account shows no stale session error");
  }).pipe(Effect.provide(layerMemory)),
);
