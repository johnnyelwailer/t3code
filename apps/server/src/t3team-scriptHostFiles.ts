/**
 * `ctx.changeRequests.fileAt` / `.blobShas` and `ctx.project.linkedRepositories`: file reads at a
 * pinned commit over `PullRequestService.fileAtRevision`, so every provider that can read a file
 * works here, and one that cannot answers a typed `ChangeRequestUnsupportedError`.
 *
 * A side of the change request (`head`/`base`) is resolved to a commit sha from the change
 * request's detail before anything is read, so a branch name never reaches a provider and the
 * answer is the same on replay. Scope is the same check as `detail`/`diff`: a repository the
 * run's project does not link is refused before the provider is asked.
 */
import type { ProjectId } from "@t3tools/contracts";
import {
  CHANGE_REQUEST_BLOB_SHAS_MAX_PATHS,
  CHANGE_REQUEST_FILE_MAX_BYTES,
  ChangeRequestInputError,
  ChangeRequestScopeError,
  ChangeRequestUnsupportedError,
  type ChangeRequestBlobShas,
  type ChangeRequestFileAt,
  type ChangeRequestFileAtInput,
  type ChangeRequestRef,
  type ScriptLinkedRepository,
} from "@t3team/sdk";
import * as Effect from "effect/Effect";

import type { PullRequestError, PullRequestService } from "./pullRequest/PullRequestService.ts";
import { isRevisionSha, isSafeRepositoryPath } from "./pullRequest/t3team-fileAtRevision.ts";
import { decodeText, sliceLines, validateRange } from "./t3team-scriptHostFileText.ts";

type PullRequests = PullRequestService["Service"];
type Target = {
  readonly projectId: ProjectId;
  readonly host: string;
  readonly repository: string;
  readonly number: number;
};
type ResolveTarget = (
  ref: ChangeRequestRef,
) => Effect.Effect<Target, ChangeRequestInputError | ChangeRequestScopeError | PullRequestError>;

const invalid = (message: string) => Effect.fail(new ChangeRequestInputError(message));

const checkPath = (path: string) =>
  isSafeRepositoryPath(path)
    ? Effect.void
    : invalid(`Path '${path}' is not a repository-relative path inside the repository.`);

const unsupportedHost = (target: Target) =>
  new ChangeRequestUnsupportedError(
    "host-cannot-read-files",
    `${target.host} cannot read a file at a revision.`,
  );

export function makeFileReads(pullRequests: PullRequests, resolve: ResolveTarget) {
  /** The commit a side of the change request is at, from its detail; explicit shas pass through. */
  const pinnedSha = (target: Target, side: "head" | "base") =>
    pullRequests.detail(target).pipe(
      Effect.flatMap((detail) => {
        const sha = side === "head" ? detail.headSha : detail.baseSha;
        return sha !== undefined && isRevisionSha(sha)
          ? Effect.succeed(sha)
          : Effect.fail(
              new ChangeRequestUnsupportedError(
                "revision-not-reported",
                `${target.host} did not report the ${side} commit of #${target.number}.`,
              ),
            );
      }),
    );

  const read = (target: Target, revision: string, path: string, maxBytes: number) =>
    pullRequests
      .fileAtRevision({ ...target, revision, path, maxBytes })
      .pipe(
        Effect.flatMap((result) =>
          result.kind === "unsupported"
            ? Effect.fail(unsupportedHost(target))
            : Effect.succeed(result),
        ),
      );

  const fileAt = (input: ChangeRequestFileAtInput) =>
    Effect.gen(function* () {
      yield* checkPath(input.path);
      const range = yield* validateRange(input.range);
      if (input.sha !== undefined && !isRevisionSha(input.sha)) {
        return yield* invalid("`sha` must be a full commit sha; use `side` for head or base.");
      }
      if ((input.sha === undefined) === (input.side === undefined)) {
        return yield* invalid("Name exactly one of `side` or `sha`.");
      }
      const target = yield* resolve(input.ref);
      const sha = input.sha ?? (yield* pinnedSha(target, input.side ?? "head"));
      const result = yield* read(target, sha, input.path, CHANGE_REQUEST_FILE_MAX_BYTES);
      if (result.kind === "missing") {
        return { kind: "missing", path: input.path, sha } satisfies ChangeRequestFileAt;
      }
      const { blobSha, size, content } = result.file;
      const base = { path: input.path, sha, blobSha };
      if (content === null) {
        return {
          kind: "too-large",
          ...base,
          size,
          maxBytes: CHANGE_REQUEST_FILE_MAX_BYTES,
        } satisfies ChangeRequestFileAt;
      }
      const text = decodeText(content);
      return text === null
        ? ({ kind: "binary", ...base, size } satisfies ChangeRequestFileAt)
        : ({ kind: "text", ...base, ...sliceLines(text, range) } satisfies ChangeRequestFileAt);
    });

  const blobShas = (ref: ChangeRequestRef, paths: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const unique = [...new Set(paths)];
      if (unique.length === 0 || unique.length > CHANGE_REQUEST_BLOB_SHAS_MAX_PATHS) {
        return yield* invalid(
          `Ask for 1 to ${CHANGE_REQUEST_BLOB_SHAS_MAX_PATHS} distinct paths, got ${unique.length}.`,
        );
      }
      yield* Effect.forEach(unique, checkPath);
      const target = yield* resolve(ref);
      const sha = yield* pinnedSha(target, "head");
      // Size 0 asks for no content: the host's blob id is all a staleness check compares.
      const entries = yield* Effect.forEach(
        unique,
        (path) =>
          read(target, sha, path, 0).pipe(
            Effect.map(
              (result) => [path, result.kind === "file" ? result.file.blobSha : null] as const,
            ),
          ),
        { concurrency: 4 },
      );
      return {
        kind: "change-request-blob-shas",
        sha,
        blobShas: Object.fromEntries(entries),
      } satisfies ChangeRequestBlobShas;
    });

  return {
    fileAt: (input: ChangeRequestFileAtInput) => Effect.runPromise(fileAt(input)),
    blobShas: (ref: ChangeRequestRef, paths: ReadonlyArray<string>) =>
      Effect.runPromise(blobShas(ref, paths)),
  };
}

/** The repositories `changeRequests` accepts for this project, with no credentials or paths. */
export const makeProjectScope = (pullRequests: PullRequests, projectId: ProjectId) => ({
  id: projectId,
  linkedRepositories: (): Promise<ReadonlyArray<ScriptLinkedRepository>> =>
    Effect.runPromise(
      pullRequests
        .projectRepositories(projectId)
        .pipe(
          Effect.map((repositories) =>
            repositories.map(({ provider, host, repository }) => ({ provider, host, repository })),
          ),
        ),
    ),
});
