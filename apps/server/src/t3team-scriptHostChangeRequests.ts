/**
 * `ctx.changeRequests` for recipe scripts: read-only change-request detail and bounded diff
 * pages over `PullRequestService`, so every provider the service reads works here too.
 *
 * Scope: a script names a repository, never a project. The reader serves only repositories the
 * service itself resolves for the run's project (its own remote plus its linked repositories),
 * and refuses anything else with `ChangeRequestScopeError` before any provider is asked. This is
 * stricter than a host-qualified `PullRequestRef`, which may route to any repository on a host.
 */
import type { PullRequestDetail, ProjectId } from "@t3tools/contracts";
import {
  type ChangeRequestDetail,
  type ChangeRequestDiffPage,
  type ChangeRequestReader,
  type ChangeRequestRef,
  ChangeRequestInputError,
  ChangeRequestScopeError,
} from "@t3team/sdk";
import * as Effect from "effect/Effect";

import type { PullRequestService } from "./pullRequest/PullRequestService.ts";
import { makeFileReads } from "./t3team-scriptHostFiles.ts";
import {
  clampDiffPageSize,
  decodeDiffCursor,
  encodeDiffCursor,
  splitPatchFiles,
  takeDiffPage,
} from "./t3team-scriptHostDiffPage.ts";

type PullRequests = PullRequestService["Service"];

/** The small, provider-neutral projection a script journals; no page-only UI state. */
function toChangeRequestDetail(detail: PullRequestDetail, host: string): ChangeRequestDetail {
  return {
    provider: detail.provider,
    host,
    repository: detail.repository,
    number: detail.number,
    title: detail.title,
    body: detail.body,
    url: detail.url,
    state: detail.state,
    isDraft: detail.isDraft,
    author:
      detail.author === null ? null : { login: detail.author.login, name: detail.author.name },
    headBranch: detail.headBranch,
    baseBranch: detail.baseBranch,
    headSha: detail.headSha ?? null,
    baseSha: detail.baseSha ?? null,
    isCrossRepository: detail.isCrossRepository ?? false,
    headRepository: detail.headRepositoryNameWithOwner ?? null,
    additions: detail.additions,
    deletions: detail.deletions,
    changedFiles: detail.changedFiles,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    mergedAt: detail.mergedAt,
    closedAt: detail.closedAt,
    ...files,
  };
}

/**
 * Pins a script's ref to a repository the service itself resolves for the run's project, or
 * refuses before any provider is asked. Shared by every verb of the reader.
 */
const makeTargetResolver =
  (pullRequests: PullRequests, projectId: ProjectId) => (ref: ChangeRequestRef) =>
    Effect.gen(function* () {
      if (!Number.isInteger(ref.number) || ref.number <= 0) {
        return yield* Effect.fail(
          new ChangeRequestInputError(`Invalid change request number: ${ref.number}`),
        );
      }
      const repository = ref.repository.trim().toLowerCase();
      const host = ref.host?.trim().toLowerCase();
      const linked = (yield* pullRequests.projectRepositories(projectId)).find(
        (candidate) =>
          candidate.repository.toLowerCase() === repository &&
          (host === undefined || candidate.host === host),
      );
      if (linked === undefined)
        return yield* Effect.fail(new ChangeRequestScopeError(ref.repository));
      return { projectId, host: linked.host, repository: linked.repository, number: ref.number };
    });

export function makeChangeRequestReader(
  pullRequests: PullRequests,
  projectId: ProjectId,
): ChangeRequestReader {
  const resolve = makeTargetResolver(pullRequests, projectId);
  const files = makeFileReads(pullRequests, resolve);

  return {
    detail: (ref) =>
      Effect.runPromise(
        resolve(ref).pipe(
          Effect.flatMap((target) =>
            pullRequests
              .detail(target)
              .pipe(Effect.map((detail) => toChangeRequestDetail(detail, target.host))),
          ),
        ),
      ),
    diff: (ref, options = {}) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const position = decodeDiffCursor(options.cursor);
          if (position === null) {
            return yield* Effect.fail(
              new ChangeRequestInputError("Invalid change request diff cursor."),
            );
          }
          const target = yield* resolve(ref);
          const slice = yield* pullRequests.diff({
            ...target,
            ...(position.slice === null ? {} : { cursor: position.slice }),
            ...(options.commit === undefined ? {} : { commit: options.commit }),
          });
          const files = splitPatchFiles(slice.patch);
          const page = takeDiffPage(files, position.offset, clampDiffPageSize(options.pageSize));
          const nextOffset = position.offset + page.fileCount;
          const next =
            nextOffset < files.length
              ? encodeDiffCursor({ slice: position.slice, offset: nextOffset })
              : slice.nextCursor === null
                ? undefined
                : encodeDiffCursor({ slice: slice.nextCursor, offset: 0 });
          const result: ChangeRequestDiffPage = {
            kind: "change-request-diff-page",
            repository: target.repository,
            number: target.number,
            patch: page.patch,
            fileCount: page.fileCount,
            truncated: page.truncated || slice.truncated,
            ...(next === undefined ? {} : { next }),
          };
          return result;
        }),
      ),
    ...files,
  };
}
