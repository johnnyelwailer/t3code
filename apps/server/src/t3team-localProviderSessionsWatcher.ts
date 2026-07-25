import { homedir } from "node:os";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";

import { syncLocalProviderSessions } from "./t3team-localProviderSessions-routes.ts";
import { ServerSettingsService } from "./serverSettings.ts";

const WATCH_DEBOUNCE = Duration.seconds(1);
const SAFETY_RECONCILE_INTERVAL = Duration.minutes(10);

export const LocalProviderSessionsWatcherLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const settings = yield* ServerSettingsService;
    const syncWhenEnabled = Effect.gen(function* () {
      if (!(yield* settings.getSettings).showLocalProviderSessions) return;
      const results = yield* syncLocalProviderSessions();
      const created = results.filter((result) => result.status === "created").length;
      if (created > 0) {
        yield* Effect.logInfo("local-provider-sessions.synced", { created });
      }
    }).pipe(
      Effect.catch((error: unknown) =>
        Effect.logWarning("local-provider-sessions.sync-failed", { error }),
      ),
    );

    const roots = [
      path.join(homedir(), ".codex", "sessions"),
      path.join(homedir(), ".claude", "projects"),
    ];
    for (const root of roots) {
      if (!(yield* fileSystem.exists(root).pipe(Effect.orElseSucceed(() => false)))) continue;
      yield* Stream.runForEach(
        fileSystem.watch(root).pipe(Stream.debounce(WATCH_DEBOUNCE)),
        () => syncWhenEnabled,
      ).pipe(
        Effect.catch((error: unknown) =>
          Effect.logWarning("local-provider-sessions.watch-failed", { root, error }),
        ),
        Effect.forkScoped,
      );
    }

    // Native watchers are cheap and prompt. This slow sweep catches missed OS
    // events and creates a path for profiles installed after server startup.
    yield* Effect.forkScoped(
      syncWhenEnabled.pipe(Effect.repeat(Schedule.spaced(SAFETY_RECONCILE_INTERVAL))),
    );
    yield* Stream.runForEach(settings.streamChanges, (nextSettings) =>
      nextSettings.showLocalProviderSessions ? syncWhenEnabled : Effect.void,
    ).pipe(Effect.forkScoped);
  }),
);
