/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import * as NodeBuffer from "node:buffer";

import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { HttpClient, HttpClientResponse } from "effect/http";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";
import { fetchAssetResponse } from "./t3team-github-routes-asset-fetch.ts";
import type {
  GitHubAssetDownloadRequest,
  GitHubDownloadedAsset,
} from "./t3team-github-routes-asset-types.ts";
import { readTrimmedString } from "./t3team-github-routes-shared.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";

const MAX_GITHUB_ASSET_BYTES = 25_000_000;

function isGitHubHostedAsset(assetHost: string, host: string): boolean {
  return (
    assetHost === host ||
    assetHost === "github.com" ||
    assetHost.endsWith(".github.com") ||
    assetHost === "githubusercontent.com" ||
    assetHost.endsWith(".githubusercontent.com")
  );
}

function invalidAssetRequest(message: string): Effect.Effect<never, T3TeamAtlassianError, never> {
  return Effect.fail(new T3TeamAtlassianError({ message }));
}

/**
 * The credential the asset's own host takes. GitHub.com and its media hosts are served by the
 * github.com account, so an Enterprise host's token is never sent to them; an asset on the
 * request's own host takes that host's. Through `GitHubApi`, so a pinned credential, Settings, the
 * environment and `gh` resolve exactly as for every other GitHub read; none signed in is no token,
 * and a public asset still loads.
 *
 * This is a download of a web asset, not an API request: it does not spend the REST quota, so it
 * has no `GitHubApi.rest` call to go through.
 */
function readGitHubToken(
  host: string,
  assetHost: string,
): Effect.Effect<string | undefined, never, GitHubApi.GitHubApi> {
  return Effect.gen(function* () {
    const api = yield* GitHubApi.GitHubApi;
    const credential = yield* api.credential(
      assetHost.toLowerCase() === host.toLowerCase() ? host : "github.com",
    );
    return readTrimmedString(Redacted.value(credential.token));
  }).pipe(Effect.orElseSucceed(() => undefined));
}

export function downloadGitHubAsset(
  input: GitHubAssetDownloadRequest,
): Effect.Effect<
  GitHubDownloadedAsset,
  T3TeamAtlassianError,
  HttpClient.HttpClient | GitHubApi.GitHubApi
> {
  const host = readTrimmedString(input.host) ?? "github.com";
  const url = readTrimmedString(input.url);
  if (!url) {
    return invalidAssetRequest("GitHub asset download requires a URL.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return invalidAssetRequest("GitHub asset download URL is invalid.");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return invalidAssetRequest("GitHub asset download requires an http or https URL.");
  }

  return Effect.gen(function* () {
    const token = isGitHubHostedAsset(parsedUrl.host, host)
      ? yield* readGitHubToken(host, parsedUrl.host)
      : undefined;
    const response = yield* fetchAssetResponse(parsedUrl, token);
    const okResponse = yield* HttpClientResponse.matchStatus({
      "2xx": (success) => Effect.succeed(success),
      orElse: (failed) =>
        Effect.fail(
          new T3TeamAtlassianError({
            message: `GitHub asset request failed with ${String(failed.status)}.`,
          }),
        ),
    })(response);

    const contentLength = Number(okResponse.headers["content-length"] ?? "");
    if (Number.isFinite(contentLength) && contentLength > MAX_GITHUB_ASSET_BYTES) {
      return yield* invalidAssetRequest(
        `GitHub asset exceeds ${String(MAX_GITHUB_ASSET_BYTES)} bytes and was skipped.`,
      );
    }

    const bytes = yield* okResponse.arrayBuffer.pipe(
      Effect.mapError((cause) => toT3TeamError(cause, "Failed to read GitHub asset response.")),
    );
    if (bytes.byteLength > MAX_GITHUB_ASSET_BYTES) {
      return yield* invalidAssetRequest(
        `GitHub asset exceeds ${String(MAX_GITHUB_ASSET_BYTES)} bytes and was skipped.`,
      );
    }

    const mimeType = readTrimmedString(okResponse.headers["content-type"] ?? undefined);
    return {
      base64Contents: Buffer.from(bytes).toString("base64"),
      ...(mimeType ? { mimeType } : {}),
      sizeBytes: bytes.byteLength,
    } satisfies GitHubDownloadedAsset;
  });
}
