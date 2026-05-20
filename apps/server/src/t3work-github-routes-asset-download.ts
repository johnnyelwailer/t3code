import { Buffer } from "node:buffer";

import * as Effect from "effect/Effect";

import { T3workAtlassianError } from "./t3work-atlassian-http.ts";
import type {
  GitHubAssetDownloadRequest,
  GitHubDownloadedAsset,
} from "./t3work-github-routes-asset-types.ts";
import { readTrimmedString } from "./t3work-github-routes-shared.ts";
import { toT3workError } from "./t3work-project-repository-utils.ts";
import type { VcsProcessShape } from "./vcs/VcsProcess.ts";

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
): Effect.Effect<GitHubDownloadedAsset, T3workAtlassianError, never> {
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
      ? yield* readGitHubToken(vcs, host)
      : undefined;
    return yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(parsedUrl, {
          headers: {
            Accept: "*/*",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          redirect: "follow",
          signal: AbortSignal.timeout(GITHUB_ASSET_TIMEOUT_MS),
        });
        if (!response.ok) {
          throw new Error(
            `GitHub asset request failed with ${String(response.status)} ${response.statusText}.`,
          );
        }

        const contentLength = Number(response.headers.get("content-length") ?? "");
        if (Number.isFinite(contentLength) && contentLength > MAX_GITHUB_ASSET_BYTES) {
          throw new Error(
            `GitHub asset exceeds ${String(MAX_GITHUB_ASSET_BYTES)} bytes and was skipped.`,
          );
        }

        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > MAX_GITHUB_ASSET_BYTES) {
          throw new Error(
            `GitHub asset exceeds ${String(MAX_GITHUB_ASSET_BYTES)} bytes and was skipped.`,
          );
        }

        const mimeType = readTrimmedString(response.headers.get("content-type") ?? undefined);
        return {
          base64Contents: Buffer.from(bytes).toString("base64"),
          ...(mimeType ? { mimeType } : {}),
          sizeBytes: bytes.byteLength,
        } satisfies GitHubDownloadedAsset;
      },
      catch: (cause) => toT3workError(cause, "Failed to download GitHub asset."),
    });
  });
}
