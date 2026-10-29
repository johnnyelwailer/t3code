/**
 * DesktopUpdates with the interim Nexi feed: what the state shows when a check or a download ends
 * in a named issue, that the issue never outlives its error, and that the feed is wired only when
 * enabled. electron-updater is the harness's fake here; its real verification is covered in
 * t3team-nexiUpdaterLibrary.test.ts.
 */
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";

import * as ElectronUpdater from "../electron/ElectronUpdater.ts";
import * as DesktopUpdates from "./DesktopUpdates.ts";
import * as NexiUpdateFeed from "./t3team-nexiUpdateFeed.ts";
import { NexiUpdateIssue } from "./t3team-nexiUpdateProvider.ts";
import { flushCallbacks, makeHarness } from "./updatesTestHarness.ts";

const feed = (enabled: boolean) =>
  Layer.succeed(
    NexiUpdateFeed.NexiUpdateFeed,
    NexiUpdateFeed.NexiUpdateFeed.of({
      enabled: Effect.succeed(enabled),
      feedOptions: Effect.succeed({ provider: "custom" } as ElectronUpdater.ElectronUpdaterFeedUrl),
      describeFailure: NexiUpdateFeed.describeNexiUpdateFailure,
    }),
  );
const checkError = (cause: unknown) =>
  new ElectronUpdater.ElectronUpdaterCheckForUpdatesError({ channel: null, cause });

describe("DesktopUpdates with the interim Nexi feed", () => {
  it.effect(
    "says signed out, with the message to show, when the check finds no GHE sign-in",
    () => {
      const harness = makeHarness({
        nexiFeed: feed(true),
        checkForUpdates: Effect.fail(
          checkError(
            new NexiUpdateIssue("signed-out", "Sign in to GHE (nexplore.ghe.com) to get updates."),
          ),
        ),
      });
      return Effect.scoped(
        Effect.gen(function* () {
          const updates = yield* DesktopUpdates.DesktopUpdates;
          yield* updates.configure;
          yield* updates.check("manual");
          const state = yield* updates.getState;
          assert.equal(state.status, "error");
          assert.equal(state.issue, "signed-out");
          assert.equal(state.errorContext, "check");
          assert.equal(state.message, "Sign in to GHE (nexplore.ghe.com) to get updates.");
          assert.isTrue(state.canRetry);
          assert.equal(harness.sentStates.at(-1)?.issue, "signed-out");
        }),
      ).pipe(Effect.provide(Layer.merge(TestClock.layer(), harness.layer)));
    },
  );

  it.effect(
    "says could-not-check for an unreachable GHE, then drops the issue when the next check is clean",
    () => {
      const harness = makeHarness({
        nexiFeed: feed(true),
        checkForUpdates: Effect.fail(
          checkError(new NexiUpdateIssue("unreachable", "Could not reach nexplore.ghe.com.")),
        ),
      });
      return Effect.scoped(
        Effect.gen(function* () {
          const updates = yield* DesktopUpdates.DesktopUpdates;
          yield* updates.configure;
          yield* updates.check("poll");
          assert.equal((yield* updates.getState).issue, "unreachable");
          harness.emit("update-not-available");
          yield* flushCallbacks;
          const recovered = yield* updates.getState;
          assert.equal(recovered.status, "up-to-date");
          assert.notProperty(recovered, "issue");
        }),
      ).pipe(Effect.provide(Layer.merge(TestClock.layer(), harness.layer)));
    },
  );

  it.effect("keeps an ordinary check error ordinary: no issue", () => {
    const harness = makeHarness({
      nexiFeed: feed(true),
      checkForUpdates: Effect.fail(checkError(new Error("boom"))),
    });
    return Effect.scoped(
      Effect.gen(function* () {
        const updates = yield* DesktopUpdates.DesktopUpdates;
        yield* updates.configure;
        yield* updates.check("manual");
        const state = yield* updates.getState;
        assert.equal(state.status, "error");
        assert.notProperty(state, "issue");
      }),
    ).pipe(Effect.provide(Layer.merge(TestClock.layer(), harness.layer)));
  });

  it.effect(
    "refuses an install when the download fails its checksum: the update stays available, nothing downloaded, and the reason is shown",
    () => {
      const mismatch = new ElectronUpdater.ElectronUpdaterDownloadUpdateError({
        channel: null,
        cause: Object.assign(new Error("sha512 checksum mismatch, expected AAAA, got BBBB"), {
          code: "ERR_CHECKSUM_MISMATCH",
        }),
      });
      const harness = makeHarness({ nexiFeed: feed(true), downloadUpdate: Effect.fail(mismatch) });
      return Effect.scoped(
        Effect.gen(function* () {
          const updates = yield* DesktopUpdates.DesktopUpdates;
          yield* updates.configure;
          harness.emit("update-available", { version: "0.1.2-rc.5" });
          yield* flushCallbacks;
          const result = yield* updates.download;
          assert.isTrue(result.accepted);
          assert.isFalse(result.completed);
          const state = yield* updates.getState;
          assert.equal(state.status, "available");
          assert.equal(state.issue, "verification-failed");
          assert.isNull(state.downloadedVersion);
          assert.match(
            state.message ?? "",
            /did not match its published checksum, so it was not installed/u,
          );
          assert.notInclude(state.message ?? "", "AAAA");
          assert.equal(harness.quitAndInstalls(), 0);
          const install = yield* updates.install;
          assert.isFalse(install.accepted);
          assert.equal(harness.quitAndInstalls(), 0);
        }),
      ).pipe(Effect.provide(Layer.merge(TestClock.layer(), harness.layer)));
    },
  );

  it.effect(
    "installs the way electron-updater's stock installer expects: silent, run after, and no install directory",
    () => {
      const harness = makeHarness({ nexiFeed: feed(true), platform: "win32" });
      return Effect.scoped(
        Effect.gen(function* () {
          const updates = yield* DesktopUpdates.DesktopUpdates;
          yield* updates.configure;
          harness.emit("update-available", { version: "0.1.2-rc.5" });
          yield* flushCallbacks;
          harness.emit("update-downloaded", { version: "0.1.2-rc.5" });
          yield* flushCallbacks;
          const install = yield* updates.install;
          assert.isTrue(install.accepted);
          assert.equal(harness.quitAndInstalls(), 1);
        }),
      ).pipe(Effect.provide(Layer.merge(TestClock.layer(), harness.layer)));
    },
  );

  it.effect(
    "sets the custom feed only when the Nexi feed is enabled and no mock feed is configured",
    () => {
      const on = makeHarness({
        nexiFeed: feed(true),
        env: { T3CODE_DESKTOP_MOCK_UPDATES: "false" },
      });
      const off = makeHarness({
        nexiFeed: feed(false),
        env: { T3CODE_DESKTOP_MOCK_UPDATES: "false" },
      });
      return Effect.scoped(
        Effect.gen(function* () {
          const enabledState = yield* Effect.gen(function* () {
            const updates = yield* DesktopUpdates.DesktopUpdates;
            yield* updates.configure;
            return yield* updates.getState;
          }).pipe(Effect.provide(on.layer));
          assert.equal(enabledState.status, "idle");
          assert.deepEqual(
            on.feedUrls().map((feedUrl) => (feedUrl as { provider?: string }).provider),
            ["custom"],
          );
          const disabledState = yield* Effect.gen(function* () {
            const updates = yield* DesktopUpdates.DesktopUpdates;
            yield* updates.configure;
            return yield* updates.getState;
          }).pipe(Effect.provide(off.layer));
          assert.equal(disabledState.status, "disabled");
          assert.notProperty(disabledState, "feed");
          assert.deepEqual(off.feedUrls(), []);
        }),
      ).pipe(Effect.provide(TestClock.layer()));
    },
  );
});
