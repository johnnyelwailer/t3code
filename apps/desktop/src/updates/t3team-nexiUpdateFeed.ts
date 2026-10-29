/**
 * Wires the interim Nexi Work updater into the desktop shell: when the packaged flavor is `live`,
 * electron-updater reads its feed from {@link makeNexiUpdateProviderClass} instead of an
 * app-update.yml, and failures it understands (signed out, GHE unreachable, a checksum that did
 * not match) are named so the UI can say what to do. Only the `live` flavor replaces the installed
 * app in place; the side-by-side nightlies must never be updated onto a release.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Duration from "effect/Duration";
import { HttpClient } from "effect/http";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { DesktopUpdateIssue } from "@t3tools/contracts";
import {
  NEXI_UPDATE_ASSET_PATH,
  NEXI_UPDATE_LATEST_PATH,
  NexiUpdateCheck,
} from "@t3tools/shared/t3team-nexiUpdateWire";

import * as DesktopBackendPool from "../backend/DesktopBackendPool.ts";
import * as DesktopLocalEnvironmentAuth from "../backend/DesktopLocalEnvironmentAuth.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import type { ElectronUpdaterFeedUrl } from "../electron/ElectronUpdater.ts";
import { isLiveFlavorPreset } from "./t3team-nexiUpdateFlavor.ts";
import { NexiUpdateIssue, makeNexiUpdateProviderClass } from "./t3team-nexiUpdateProvider.ts";

export interface NexiUpdateFailure {
  readonly issue: DesktopUpdateIssue;
  readonly message: string;
}

const CHECK_TIMEOUT_MS = 30_000;
const decodeCheck = Schema.decodeUnknownSync(NexiUpdateCheck);

/** What a failed check or download means for the user, or none when it is an ordinary error. */
export function describeNexiUpdateFailure(cause: unknown): Option.Option<NexiUpdateFailure> {
  for (let depth = 0, current: unknown = cause; depth < 4; depth += 1) {
    if (current instanceof NexiUpdateIssue) {
      return Option.some({ issue: current.kind, message: current.message });
    }
    if (typeof current !== "object" || current === null) break;
    if ((current as { code?: unknown }).code === "ERR_CHECKSUM_MISMATCH") {
      return Option.some({
        issue: "verification-failed",
        message:
          "The downloaded update did not match its published checksum, so it was not installed.",
      });
    }
    current = (current as { cause?: unknown }).cause;
  }
  return Option.none();
}

export class NexiUpdateFeed extends Context.Service<
  NexiUpdateFeed,
  {
    readonly enabled: Effect.Effect<boolean>;
    readonly feedOptions: Effect.Effect<ElectronUpdaterFeedUrl>;
    readonly describeFailure: (cause: unknown) => Option.Option<NexiUpdateFailure>;
  }
>()("@t3tools/desktop/updates/t3team-nexiUpdateFeed/NexiUpdateFeed") {}

/** No interim feed: upstream builds and every non-live flavor keep electron-updater's own config. */
export const disabledLayer = Layer.succeed(
  NexiUpdateFeed,
  NexiUpdateFeed.of({
    enabled: Effect.succeed(false),
    feedOptions: Effect.die("The interim Nexi update feed is not enabled."),
    describeFailure: describeNexiUpdateFailure,
  }),
);

export const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const fileSystem = yield* FileSystem.FileSystem;
  const pool = yield* DesktopBackendPool.DesktopBackendPool;
  const localAuth = yield* DesktopLocalEnvironmentAuth.DesktopLocalEnvironmentAuth;
  const http = yield* HttpClient.HttpClient;
  const context = yield* Effect.context<never>();
  const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromiseWith(context)(effect);

  const enabled = Effect.gen(function* () {
    if (!environment.isPackaged) return false;
    const preset = yield* fileSystem
      .readFileString(environment.path.join(environment.resourcesPath, "flag-preset.json"))
      .pipe(Effect.option);
    return isLiveFlavorPreset(Option.getOrUndefined(preset));
  }).pipe(Effect.orElseSucceed(() => false));

  const backendUrl = async (path: string) => {
    const config = await run(Effect.flatMap(pool.primary, (primary) => primary.currentConfig));
    if (Option.isNone(config)) {
      throw new NexiUpdateIssue("unreachable", "The local backend is not running yet.");
    }
    return new URL(path, config.value.httpBaseUrl);
  };
  const bearer = () => run(localAuth.getBearerToken);

  const check = async () => {
    const url = await backendUrl(NEXI_UPDATE_LATEST_PATH);
    url.searchParams.set("version", environment.appVersion);
    url.searchParams.set("platform", environment.platform);
    url.searchParams.set("arch", environment.runtimeInfo.appArch);
    try {
      const authorization = `Bearer ${await bearer()}`;
      const body = await run(
        http.get(url, { headers: { authorization } }).pipe(
          Effect.filterOrFail(
            (response) => response.status >= 200 && response.status < 300,
            (response) =>
              new NexiUpdateIssue(
                "unreachable",
                `The update check failed (HTTP ${response.status}).`,
              ),
          ),
          Effect.flatMap((response) => response.json),
          Effect.timeout(Duration.millis(CHECK_TIMEOUT_MS)),
        ),
      );
      return decodeCheck(body);
    } catch (error) {
      if (error instanceof NexiUpdateIssue) throw error;
      throw new NexiUpdateIssue("unreachable", "Could not check for updates.");
    }
  };

  const updateProvider = makeNexiUpdateProviderClass({
    currentVersion: environment.appVersion,
    check,
    assetUrl: async (assetId, name) =>
      (await backendUrl(`${NEXI_UPDATE_ASSET_PATH}/${assetId}/${encodeURIComponent(name)}`)).href,
    bearer,
  });

  return NexiUpdateFeed.of({
    enabled,
    feedOptions: Effect.succeed({ provider: "custom", updateProvider } as ElectronUpdaterFeedUrl),
    describeFailure: describeNexiUpdateFailure,
  });
});

export const layer = Layer.effect(NexiUpdateFeed, make);
