import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { HttpClient, HttpClientResponse } from "effect/http";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as GitHubCredentials from "@t3tools/source-control-github/server/GitHubCredentials";
import { downloadGitHubAsset } from "./t3team-github-routes-asset-download.ts";
import { makeFakeGitHubApi, restOk } from "./t3team-githubRestApi.fixtures.ts";

const png = Uint8Array.from([137, 80, 78, 71]);

/** A client that records the Authorization header of the one request it answers. */
function recordingClient(seen: Array<string | undefined>) {
  return HttpClient.make((request) => {
    seen.push(request.headers["authorization"]);
    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(png, { status: 200, headers: { "content-type": "image/png" } }),
      ),
    );
  });
}

describe("downloadGitHubAsset", () => {
  it.effect("downloads GitHub-hosted assets with the credential GitHubApi holds for the host", () =>
    Effect.gen(function* () {
      const seen: Array<string | undefined> = [];
      const { api, calls, credentialHosts } = makeFakeGitHubApi(
        () => restOk({}),
        () => Effect.succeed({ token: Redacted.make("gh-token"), fingerprint: "github.com:abc" }),
      );

      const result = yield* downloadGitHubAsset({
        host: "github.com",
        url: "https://private-user-images.githubusercontent.com/assets/example.png",
      }).pipe(
        Effect.provideService(HttpClient.HttpClient, recordingClient(seen)),
        Effect.provideService(GitHubApi.GitHubApi, api),
      );

      expect(seen).toEqual(["Bearer gh-token"]);
      expect(result.mimeType).toBe("image/png");
      expect(result.sizeBytes).toBe(4);
      expect(result.base64Contents).toBe(Buffer.from(png).toString("base64"));
      // The token came from GitHubApi.credential; no REST request and no subprocess was involved.
      expect(credentialHosts).toEqual(["github.com"]);
      expect(calls).toEqual([]);
    }),
  );

  it.effect("never sends an Enterprise host's credential to github.com's asset hosts", () =>
    Effect.gen(function* () {
      const seen: Array<string | undefined> = [];
      const { api, credentialHosts } = makeFakeGitHubApi(() => restOk({}));

      yield* downloadGitHubAsset({
        host: "nexplore.ghe.com",
        url: "https://private-user-images.githubusercontent.com/assets/example.png",
      }).pipe(
        Effect.provideService(HttpClient.HttpClient, recordingClient(seen)),
        Effect.provideService(GitHubApi.GitHubApi, api),
      );
      yield* downloadGitHubAsset({
        host: "nexplore.ghe.com",
        url: "https://nexplore.ghe.com/user-attachments/assets/1",
      }).pipe(
        Effect.provideService(HttpClient.HttpClient, recordingClient(seen)),
        Effect.provideService(GitHubApi.GitHubApi, api),
      );

      expect(credentialHosts).toEqual(["github.com", "nexplore.ghe.com"]);
    }),
  );

  it.effect("still loads a public asset when no credential is held for the host", () =>
    Effect.gen(function* () {
      const seen: Array<string | undefined> = [];
      const { api } = makeFakeGitHubApi(
        () => restOk({}),
        () => Effect.fail(new GitHubCredentials.GitHubNotSignedInError({ host: "github.com" })),
      );

      const result = yield* downloadGitHubAsset({
        host: "github.com",
        url: "https://github.com/user-attachments/assets/1",
      }).pipe(
        Effect.provideService(HttpClient.HttpClient, recordingClient(seen)),
        Effect.provideService(GitHubApi.GitHubApi, api),
      );

      expect(seen).toEqual([undefined]);
      expect(result.sizeBytes).toBe(4);
    }),
  );

  it.effect("sends no credential to a host that is not GitHub's", () =>
    Effect.gen(function* () {
      const seen: Array<string | undefined> = [];
      const { api, credentialHosts } = makeFakeGitHubApi(() => restOk({}));

      yield* downloadGitHubAsset({
        host: "github.com",
        url: "https://objects.example.com/signed/1.png",
      }).pipe(
        Effect.provideService(HttpClient.HttpClient, recordingClient(seen)),
        Effect.provideService(GitHubApi.GitHubApi, api),
      );

      expect(seen).toEqual([undefined]);
      expect(credentialHosts).toEqual([]);
    }),
  );

  it.effect("follows a redirect itself and sends the token only to the asset's own origin", () =>
    Effect.gen(function* () {
      const seen: Array<{ url: string; authorization: string | undefined }> = [];
      const client = HttpClient.make((request) => {
        seen.push({ url: request.url, authorization: request.headers["authorization"] });
        return Effect.succeed(
          request.url.startsWith("https://github.com/")
            ? HttpClientResponse.fromWeb(
                request,
                new Response(null, {
                  status: 302,
                  headers: { location: "https://objects.example.com/signed/1.png?sig=abc" },
                }),
              )
            : HttpClientResponse.fromWeb(
                request,
                new Response(png, { status: 200, headers: { "content-type": "image/png" } }),
              ),
        );
      });
      const { api } = makeFakeGitHubApi(
        () => restOk({}),
        () => Effect.succeed({ token: Redacted.make("gh-token"), fingerprint: "github.com:abc" }),
      );

      const result = yield* downloadGitHubAsset({
        host: "github.com",
        url: "https://github.com/user-attachments/assets/1",
      }).pipe(
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.provideService(GitHubApi.GitHubApi, api),
      );

      expect(seen).toEqual([
        { url: "https://github.com/user-attachments/assets/1", authorization: "Bearer gh-token" },
        { url: "https://objects.example.com/signed/1.png?sig=abc", authorization: undefined },
      ]);
      expect(result.sizeBytes).toBe(4);
    }),
  );

  it.effect("keeps the token on a same-origin redirect and refuses a redirect to http", () =>
    Effect.gen(function* () {
      const seen: Array<string | undefined> = [];
      const client = HttpClient.make((request) => {
        seen.push(request.headers["authorization"]);
        const location =
          request.url === "https://github.com/a"
            ? "https://github.com/b"
            : "http://insecure.example/c";
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(null, { status: 302, headers: { location } }),
          ),
        );
      });
      const { api } = makeFakeGitHubApi(() => restOk({}));

      const error = yield* Effect.flip(
        downloadGitHubAsset({ host: "github.com", url: "https://github.com/a" }).pipe(
          Effect.provideService(HttpClient.HttpClient, client),
          Effect.provideService(GitHubApi.GitHubApi, api),
        ),
      );

      // /a then the same-origin /b carry the token; the http hop is never requested.
      expect(seen).toEqual(["Bearer test-token", "Bearer test-token"]);
      expect(error.message).toContain("failed with 302");
    }),
  );

  it.effect("never sends the token to a plain-http asset URL", () =>
    Effect.gen(function* () {
      const seen: Array<string | undefined> = [];
      const client = HttpClient.make((request) => {
        seen.push(request.headers["authorization"]);
        return Effect.succeed(
          HttpClientResponse.fromWeb(request, new Response("data", { status: 200 })),
        );
      });
      const { api } = makeFakeGitHubApi(() => restOk({}));

      yield* downloadGitHubAsset({ host: "github.com", url: "http://github.com/a" }).pipe(
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.provideService(GitHubApi.GitHubApi, api),
      );

      expect(seen).toEqual([undefined]);
    }),
  );
});
