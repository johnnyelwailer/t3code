import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";

import { syncLocalProviderSessions } from "./local-provider-sessions-routes.ts";
import { ServerSettingsService } from "./serverSettings.ts";

const WATCH_INTERVAL = Duration.seconds(15);

export const LocalProviderSessionsWatcherLive = Layer.effectDiscard(
  Effect.gen(function* () {
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

    yield* Effect.forkScoped(syncWhenEnabled.pipe(Effect.repeat(Schedule.spaced(WATCH_INTERVAL))));
    yield* Stream.runForEach(settings.streamChanges, (nextSettings) =>
      nextSettings.showLocalProviderSessions ? syncWhenEnabled : Effect.void,
    ).pipe(Effect.forkScoped);
  }),
);
