import { Buffer, isUtf8 } from "node:buffer";
import * as Effect from "effect/Effect";
import type { VcsProcessShape } from "./t3work-vcsProcessShape.ts";
import { buildContentsPath, runJsonObject } from "./t3work-github-routes-pr-api.ts";
import type {
  GitHubPullRequestContextDetails,
  GitHubPullRequestContextFile,
  GitHubPullRequestFileSnapshot,
  GitHubPullRequestFileVersionSnapshot,
} from "./t3work-github-routes-pr-types.ts";
import { readTrimmedString } from "./t3work-github-routes-shared.ts";

type GitHubRepositoryContentsResponse = {
  readonly type?: string;
  readonly size?: number;
  readonly content?: string;
};

function fetchRepositoryFileVersion(input: {
  vcs: VcsProcessShape;
  host: string;
  repository: string;
  path: string;
  ref: string;
  operation: string;
}): Effect.Effect<GitHubPullRequestFileVersionSnapshot, never, never> {
  return runJsonObject<GitHubRepositoryContentsResponse>({
    vcs: input.vcs,
    host: input.host,
    operation: input.operation,
    path: buildContentsPath({
      repository: input.repository,
      path: input.path,
      ref: input.ref,
    }),
    accept: "application/vnd.github.object",
    maxOutputBytes: 10_000_000,
  }).pipe(
    Effect.map((result) => {
      if (result.type !== "file") {
        return {
          path: input.path,
          ref: input.ref,
          error: `GitHub contents API returned type ${String(result.type ?? "unknown")}.`,
        } satisfies GitHubPullRequestFileVersionSnapshot;
      }

      const encoded = readTrimmedString(result.content);
      if (!encoded) {
        return {
          path: input.path,
          ref: input.ref,
          error: "GitHub contents API returned no file content.",
        } satisfies GitHubPullRequestFileVersionSnapshot;
      }

      const raw = encoded.replace(/\n/g, "");
      const buffer = Buffer.from(raw, "base64");
      if (isUtf8(buffer)) {
        return {
          path: input.path,
          ref: input.ref,
          encoding: "utf8",
          contents: buffer.toString("utf8"),
          ...(typeof result.size === "number" ? { sizeBytes: result.size } : {}),
        } satisfies GitHubPullRequestFileVersionSnapshot;
      }

      return {
        path: input.path,
        ref: input.ref,
        encoding: "base64",
        contents: raw,
        ...(typeof result.size === "number" ? { sizeBytes: result.size } : {}),
      } satisfies GitHubPullRequestFileVersionSnapshot;
    }),
    Effect.catch((cause) =>
      Effect.succeed({
        path: input.path,
        ref: input.ref,
        error: cause.message,
      } satisfies GitHubPullRequestFileVersionSnapshot),
    ),
  );
}

export function fetchFileSnapshots(input: {
  vcs: VcsProcessShape;
  host: string;
  repository: string;
  pullRequest: GitHubPullRequestContextDetails;
  files: ReadonlyArray<GitHubPullRequestContextFile>;
}): Effect.Effect<ReadonlyArray<GitHubPullRequestFileSnapshot>, never, never> {
  const baseRef = readTrimmedString(input.pullRequest.base?.sha);
  const headRef = readTrimmedString(input.pullRequest.head?.sha);

  return Effect.forEach(
    input.files,
    (file) => {
      const path = readTrimmedString(file.filename);
      if (!path) {
        return Effect.succeed({
          path: "unknown",
          ...(file.status ? { status: file.status } : {}),
        } satisfies GitHubPullRequestFileSnapshot);
      }

      const previousPath = readTrimmedString(file.previous_filename);
      const basePath = previousPath ?? path;
      const base =
        file.status === "added" || !baseRef
          ? undefined
          : fetchRepositoryFileVersion({
              vcs: input.vcs,
              host: input.host,
              repository: input.repository,
              path: basePath,
              ref: baseRef,
              operation: "t3work.github.pr-context.base-file",
            });
      const head =
        file.status === "removed" || !headRef
          ? undefined
          : fetchRepositoryFileVersion({
              vcs: input.vcs,
              host: input.host,
              repository: input.repository,
              path,
              ref: headRef,
              operation: "t3work.github.pr-context.head-file",
            });

      return Effect.all({
        ...(base ? { base } : {}),
        ...(head ? { head } : {}),
      }).pipe(
        Effect.map((versions) => {
          const snapshot: GitHubPullRequestFileSnapshot = { path };
          if (file.status) {
            Object.assign(snapshot, { status: file.status });
          }
          if (previousPath) {
            Object.assign(snapshot, { previousPath });
          }
          if (versions.base) {
            Object.assign(snapshot, { base: versions.base });
          }
          if (versions.head) {
            Object.assign(snapshot, { head: versions.head });
          }
          return snapshot;
        }),
      );
    },
    { concurrency: 4 },
  );
}
