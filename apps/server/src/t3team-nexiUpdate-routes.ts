/**
 * The two routes behind the desktop's interim updater. Both sit in the authenticated t3team
 * group and additionally take only the local bearer the desktop main process holds: a cookie
 * session (a web page) is refused, since nothing but the desktop shell has a use for them.
 */
import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpClient, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";

import {
  NEXI_UPDATE_ASSET_PATH,
  NEXI_UPDATE_LATEST_PATH,
} from "@t3tools/shared/t3team-nexiUpdateWire";

import {
  checkNexiUpdate,
  createNexiAssetRegistry,
  openNexiAsset,
  type NexiAssetRegistry,
} from "./t3team-nexiUpdate-service.ts";
import { makeNexiSource, resolveNexiApiBase } from "./t3team-nexiUpdate-source.ts";

const refuse = (status: number, error: string) =>
  HttpServerResponse.jsonUnsafe({ error }, { status });

const hasLocalBearer = (request: HttpServerRequest.HttpServerRequest) =>
  /^Bearer\s+\S+$/u.test(request.headers["authorization"] ?? "");

const readQuery = (request: HttpServerRequest.HttpServerRequest) => {
  const url = HttpServerRequest.toURL(request);
  return url._tag === "Some" ? url.value.searchParams : new URLSearchParams();
};

/** Built per request from the app's own services: the source holds no state, the registry does. */
const sourceFromContext = Effect.gen(function* () {
  const api = yield* GitHubApi.GitHubApi;
  const http = yield* HttpClient.HttpClient;
  return makeNexiSource(resolveNexiApiBase(process.env), api, http);
});

export const makeNexiUpdateRouteLayer = (registry: NexiAssetRegistry) => {
  const latest = HttpRouter.add(
    "GET",
    NEXI_UPDATE_LATEST_PATH,
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (!hasLocalBearer(request))
        return refuse(403, "The update check is for the desktop app only.");
      const query = readQuery(request);
      const version = query.get("version")?.trim() ?? "";
      const platform = query.get("platform")?.trim() ?? "";
      const arch = query.get("arch")?.trim() ?? "";
      if (!version || !platform || !arch) {
        return refuse(400, "version, platform and arch are required.");
      }
      const source = yield* sourceFromContext;
      return HttpServerResponse.jsonUnsafe(
        yield* checkNexiUpdate(source, registry, { version, platform, arch }),
      );
    }),
  );

  const asset = HttpRouter.add(
    "GET",
    NEXI_UPDATE_ASSET_PATH,
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (!hasLocalBearer(request))
        return refuse(403, "Update downloads are for the desktop app only.");
      const rawId = readQuery(request).get("id") ?? "";
      if (!/^\d{1,15}$/u.test(rawId)) return refuse(400, "A numeric asset id is required.");
      const source = yield* sourceFromContext;
      const opened = yield* openNexiAsset(source, registry, Number(rawId));
      if (opened === null) return refuse(404, "Not an update asset. Check for updates again.");
      return HttpServerResponse.stream(opened.response.stream, {
        contentType: "application/octet-stream",
        headers: { "content-length": String(opened.size), "cache-control": "no-store" },
      });
    }).pipe(
      Effect.catch((failure) =>
        Effect.succeed(refuse(failure.kind === "signed-out" ? 401 : 502, failure.message)),
      ),
    ),
  );

  return Layer.mergeAll(latest, asset);
};

export const t3teamNexiUpdateRouteLayer = makeNexiUpdateRouteLayer(createNexiAssetRegistry());
