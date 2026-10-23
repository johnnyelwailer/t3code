/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- HTTP route integration bridges Effect for HttpClient assertions. */
// @effect-diagnostics missingEffectContext:off - route server boot is fully provided before runPromise.
/**
 * Feature-gated routes answer `feature_disabled` without running their handler while the flag is
 * off, and run it again on the next request once the flag is on.
 */
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpBody, HttpClient, HttpRouter, HttpServerResponse } from "effect/http";
import { afterEach, describe, expect, it } from "vite-plus/test";

import * as ServerConfig from "./config.ts";
import * as ProjectService from "./project/ProjectService.ts";
import { PullRequestProviderRegistry } from "./pullRequest/PullRequestProviderRegistry.ts";
import * as PullRequestService from "./pullRequest/PullRequestService.ts";
import {
  t3teamAtlassianConnectBasicRouteLayer,
  t3teamAtlassianConnectOAuthRouteLayer,
} from "./t3team-atlassian-routes.ts";
import { t3teamAtlassianOAuthExchangeRouteLayer } from "./t3team-atlassian-oauth-routes.ts";
import {
  t3teamAtlassianOAuthBeginRouteLayer,
  t3teamAtlassianOAuthCallbackRouteLayer,
} from "./t3team-atlassian-oauth-flowRoutes.ts";
import { whenRouteFeatureEnabled } from "./t3team-featureFlagRoute.ts";
import {
  t3teamGitHubAssetRouteLayer,
  t3teamGitHubPullRequestContextRouteLayer,
} from "./t3team-github-routes.ts";

let handlerRuns = 0;
const probeRouteLayer = HttpRouter.add(
  "POST",
  "/probe",
  whenRouteFeatureEnabled(
    "CHANGE_REQUEST_WORKSPACE",
    Effect.sync(() => {
      handlerRuns += 1;
      return HttpServerResponse.text("ran");
    }),
  ),
);

const routes = Layer.mergeAll(
  probeRouteLayer,
  t3teamAtlassianConnectBasicRouteLayer,
  t3teamAtlassianConnectOAuthRouteLayer,
  t3teamAtlassianOAuthBeginRouteLayer,
  t3teamAtlassianOAuthCallbackRouteLayer,
  t3teamAtlassianOAuthExchangeRouteLayer,
  t3teamGitHubPullRequestContextRouteLayer,
  t3teamGitHubAssetRouteLayer,
);

/** What the GitHub handlers would read; a gated request never reaches them. */
const unreachedHandlerServices = Layer.mergeAll(
  Layer.mock(GitHubApi.GitHubApi)({}),
  Layer.mock(ProjectService.ProjectService)({}),
  Layer.mock(PullRequestProviderRegistry)({ get: () => null, kinds: [] }),
  Layer.mock(PullRequestService.PullRequestService)({}),
  ServerConfig.layerTest(process.cwd(), { prefix: "t3-feature-flag-route-" }),
).pipe(Layer.provideMerge(NodeServices.layer));

const serve = HttpRouter.serve(routes, { disableListenLog: true, disableLogger: true }).pipe(
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provide(unreachedHandlerServices),
);

const post = (path: string) =>
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const response = yield* http.post(path, { body: HttpBody.jsonUnsafe({}) });
    return { status: response.status, body: yield* response.text };
  });

const run = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(Layer.mergeAll(serve, NodeServices.layer))),
  );

afterEach(() => replaceFeatureFlagPresetValues(new Map()));

describe("whenRouteFeatureEnabled", () => {
  it("skips the handler while the flag is off and runs it once the flag is on", async () => {
    handlerRuns = 0;
    replaceFeatureFlagPresetValues(new Map([["CHANGE_REQUEST_WORKSPACE", false]]));
    const off = await run(post("/probe"));
    expect(off.status).toBe(403);
    expect(JSON.parse(off.body)).toEqual({
      error: "Pull request workspace is turned off on this host (Settings → Features).",
      code: "feature_disabled",
    });
    expect(handlerRuns).toBe(0);

    replaceFeatureFlagPresetValues(new Map([["CHANGE_REQUEST_WORKSPACE", true]]));
    const on = await run(post("/probe"));
    expect(on).toEqual({ status: 200, body: "ran" });
    expect(handlerRuns).toBe(1);
  });

  it("closes every Jira connection route while Jira is off", async () => {
    replaceFeatureFlagPresetValues(new Map([["INTEGRATIONS_ATLASSIAN", false]]));
    for (const path of [
      "/api/t3team/atlassian/connect/basic",
      "/api/t3team/atlassian/connect/oauth",
      "/api/t3team/atlassian/oauth/begin",
      "/api/t3team/atlassian/oauth/complete",
      "/api/t3team/atlassian/oauth/exchange",
    ]) {
      const response = await run(post(path));
      expect(response.status, path).toBe(403);
      expect(JSON.parse(response.body), path).toMatchObject({ code: "feature_disabled" });
    }
  });

  it("closes the pull request context and asset routes while the workspace is off", async () => {
    replaceFeatureFlagPresetValues(new Map([["CHANGE_REQUEST_WORKSPACE", false]]));
    for (const path of ["/api/t3team/github/pull-request-context", "/api/t3team/github/asset"]) {
      const response = await run(post(path));
      expect(response.status, path).toBe(403);
      expect(JSON.parse(response.body), path).toMatchObject({ code: "feature_disabled" });
    }
  });
});
