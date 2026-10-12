import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { HttpClient, HttpClientResponse } from "effect/http";

import * as GitHubApi from "./sourceControl/GitHubApi.ts";
import * as GitHubCredentials from "./sourceControl/GitHubCredentials.ts";
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
});
