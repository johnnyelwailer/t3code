import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import type { SourceControlDriverInstance } from "@t3tools/source-control-core/server/driver";
import { fakeSourceControlDriverInstance } from "@t3tools/source-control-testing/fakeSourceControlDriver";
import { definition } from "@t3tools/source-control-github/shared/definition";
import * as Effect from "effect/Effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as BuiltInDrivers from "./sourceControl/builtInDrivers.ts";
import { downloadGitHubAsset } from "./t3team-github-routes-asset-download.ts";
import { makeFakeGitHubApi, restOk } from "./t3team-githubRestApi.fixtures.ts";

const png = Uint8Array.from([137, 80, 78, 71]);

function drivers(fetchMedia: NonNullable<SourceControlDriverInstance["fetchMedia"]>) {
  return [
    {
      driver: { kind: definition.kind, definition },
      instance: fakeSourceControlDriverInstance(definition.kind, { fetchMedia }),
    },
  ];
}

describe("downloadGitHubAsset for media the user sees through the media proxy", () => {
  it.effect("fetches an enterprise file the way the user's PR detail does", () =>
    Effect.gen(function* () {
      const proxied: Array<string> = [];
      const direct: Array<string> = [];
      const { api } = makeFakeGitHubApi(() => restOk({}));

      const result = yield* downloadGitHubAsset({
        host: "nexplore.ghe.com",
        url: "https://nexplore.ghe.com/hive/nx-nexi/blob/pr-evidence/pr-1356/shot.png?raw=true",
      }).pipe(
        Effect.provideService(
          BuiltInDrivers.SourceControlDrivers,
          drivers((request) => {
            proxied.push(request.url);
            const get = HttpClientRequest.get(request.url);
            return Effect.succeed(
              HttpClientResponse.fromWeb(
                get,
                new Response(png, { status: 200, headers: { "content-type": "image/png" } }),
              ),
            );
          }),
        ),
        Effect.provideService(
          HttpClient.HttpClient,
          HttpClient.make((request) => {
            direct.push(request.url);
            return Effect.succeed(
              HttpClientResponse.fromWeb(request, new Response("<html>", { status: 200 })),
            );
          }),
        ),
        Effect.provideService(GitHubApi.GitHubApi, api),
      );

      expect(proxied).toEqual([
        "https://raw.nexplore.ghe.com/hive/nx-nexi/pr-evidence/pr-1356/shot.png",
      ]);
      expect(direct).toEqual([]);
      expect(result).toEqual({
        base64Contents: Buffer.from(png).toString("base64"),
        mimeType: "image/png",
        sizeBytes: 4,
      });
    }),
  );

  it.effect("fails rather than saving anything when the proxy refuses the host", () =>
    Effect.gen(function* () {
      const { api } = makeFakeGitHubApi(() => restOk({}));
      const exit = yield* downloadGitHubAsset({
        host: "other.ghe.com",
        url: "https://other.ghe.com/user-attachments/assets/1a1842fb",
      }).pipe(
        Effect.provideService(
          BuiltInDrivers.SourceControlDrivers,
          drivers(() => Effect.succeed(null)),
        ),
        Effect.provideService(GitHubApi.GitHubApi, api),
        Effect.provideService(
          HttpClient.HttpClient,
          HttpClient.make(() => Effect.die("no direct request")),
        ),
        Effect.exit,
      );
      expect(exit._tag).toBe("Failure");
    }),
  );
});
