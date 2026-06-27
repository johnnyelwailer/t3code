/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import * as NodeBuffer from "node:buffer";

import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { T3workAtlassianError } from "./t3work-atlassian-http.ts";
import type {
  GitHubAssetDownloadRequest,
  GitHubDownloadedAsset,
} from "./t3work-github-routes-asset-types.ts";
import { readTrimmedString } from "./t3work-github-routes-shared.ts";
import { toT3workError } from "./t3work-project-repository-utils.ts";
import type { VcsProcessShape } from "./t3work-vcsProcessShape.ts";

const MAX_GITHUB_ASSET_BYTES = 25_000_000;
const GITHUB_ASSET_TIMEOUT_MS = 20_000;

function isGitHubHostedAsset(assetHost: string, host: string): boolean {
  return (
    assetHost === host ||
    assetHost === "github.com" ||
    assetHost.endsWith(".github.com") ||
    assetHost === "githubusercontent.com" ||
    assetHost.endsWith(".githubusercontent.com")
  );
}

function invalidAssetRequest(message: string): Effect.Effect<never, T3workAtlassianError, never> {
  return Effect.fail(new T3workAtlassianError({ message }));
}

function readGitHubToken(
  vcs: VcsProcessShape,
  host: string,
): Effect.Effect<string | undefined, never, never> {
  return vcs
    .run({
      operation: "t3work.github.asset.auth-token",
      command: "gh",
      args: ["auth", "token", "--hostname", host],
      cwd: process.cwd(),
      allowNonZeroExit: true,
      timeoutMs: 5_000,
      maxOutputBytes: 16_000,
      appendTruncationMarker: true,
    })
    .pipe(
      Effect.map((result) =>
        result.exitCode === 0 ? readTrimmedString(result.stdout) : undefined,
      ),
      Effect.orElseSucceed(() => undefined),
    );
}

export function downloadGitHubAsset(
  vcs: VcsProcessShape,
  input: GitHubAssetDownloadRequest,
): Effect.Effect<GitHubDownloadedAsset, T3workAtlassianError, HttpClient.HttpClient> {
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
    const httpClient = yield* HttpClient.HttpClient;
    const token = isGitHubHostedAsset(parsedUrl.host, host)
      ? yield* readGitHubToken(vcs, host)
      : undefined;
    const response = yield* httpClient
      .get(parsedUrl.toString(), {
        headers: {
          Accept: "*/*",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      .pipe(
        Effect.timeoutOption(Duration.millis(GITHUB_ASSET_TIMEOUT_MS)),
        Effect.mapError((cause) => toT3workError(cause, "Failed to download GitHub asset.")),
        Effect.flatMap((responseOption) =>
          Option.match(responseOption, {
            onNone: () =>
              Effect.fail(
                new T3workAtlassianError({
                  message: `GitHub asset download timed out after ${String(GITHUB_ASSET_TIMEOUT_MS)}ms.`,
                }),
              ),
            onSome: (settledResponse) => Effect.succeed(settledResponse),
          }),
        ),
      );
    const okResponse = yield* HttpClientResponse.matchStatus({
      "2xx": (success) => Effect.succeed(success),
      orElse: (failed) =>
        Effect.fail(
          new T3workAtlassianError({
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
      Effect.mapError((cause) => toT3workError(cause, "Failed to read GitHub asset response.")),
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
