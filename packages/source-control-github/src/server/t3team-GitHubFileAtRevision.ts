/**
 * `readFileAtRevision` for GitHub (and GitHub Enterprise): the `contents` API at a commit sha,
 * which answers with the file's git blob sha, size and (up to 1 MB) its base64 content.
 */
import * as Effect from "effect/Effect";

import type * as GitHubApi from "./t3team-GitHubApi.ts";
import {
  encodePathSegments,
  fileFromHostJson,
  isRepositorySelector,
  isRevisionSha,
  isSafeRepositoryPath,
  type FileAtRevisionRequest,
  type ProviderFileAtRevision,
} from "@t3tools/source-control-core/server/t3team-fileAtRevision";

/**
 * Base64 plus the JSON envelope. GitHub inlines files up to 1 MB (about 1.4 MB encoded), and does
 * so whatever the caller wants, so the budget never drops below that: a larger file must still
 * answer with its blob sha rather than read as truncated.
 */
const outputBudget = (maxBytes: number) =>
  Math.max(Math.ceil(maxBytes * 1.4) + 64 * 1024, 2 * 1024 * 1024);

/** A path or revision GitHub says it does not have, as opposed to a read that failed. */
const isNotFound = (error: { readonly _tag: string; readonly status?: number | undefined }) =>
  error._tag === "GitHubApiResponseError" && error.status === 404;

/**
 * Null: nothing readable at that path (missing, a directory, a symlink). Undefined: GitHub
 * answered, but not with something this reader understands, or the request was malformed.
 */
export const readGitHubFileAtRevision = (
  api: Pick<GitHubApi.GitHubApi["Service"], "rest">,
  input: FileAtRevisionRequest,
) => {
  if (
    !isRepositorySelector(input.repository) ||
    !isRevisionSha(input.revision) ||
    !isSafeRepositoryPath(input.path)
  ) {
    return Effect.succeed<ProviderFileAtRevision | null | undefined>(undefined);
  }
  const limit = Math.max(0, Math.floor(input.maxBytes));
  return api
    .rest({
      host: input.host,
      operation: "t3team.readFileAtRevision",
      path: `repos/${input.repository}/contents/${encodePathSegments(input.path)}?ref=${input.revision}`,
      maxResponseBytes: outputBudget(limit),
    })
    .pipe(
      Effect.map((response) =>
        response.truncated ? undefined : fileFromHostJson(response.body.trim(), limit),
      ),
      Effect.catchIf(isNotFound, () =>
        Effect.succeed<ProviderFileAtRevision | null | undefined>(null),
      ),
    );
};
