/**
 * `readFileAtRevision` for GitHub (and GitHub Enterprise): the `contents` API at a commit sha,
 * which answers with the file's git blob sha, size and (up to 1 MB) its base64 content.
 */
import * as Effect from "effect/Effect";

import type { GitHubCli } from "../sourceControl/GitHubCli.ts";
import {
  encodePathSegments,
  fileFromHostJson,
  isRepositorySelector,
  isRevisionSha,
  isSafeRepositoryPath,
  type FileAtRevisionRequest,
  type ProviderFileAtRevision,
} from "./t3team-fileAtRevision.ts";

const TIMEOUT_MS = 60_000;
/** Base64 plus the JSON envelope; GitHub only inlines files up to 1 MB. */
const outputBudget = (maxBytes: number) => Math.ceil(maxBytes * 1.4) + 64 * 1024;

/** A path or revision GitHub says it does not have, as opposed to a read that failed. */
const isNotFound = (error: { readonly _tag: string; readonly httpStatus?: number }) =>
  error._tag === "GitHubPullRequestNotFoundError" ||
  (error._tag === "GitHubCliCommandError" && error.httpStatus === 404);

/**
 * Null: nothing readable at that path (missing, a directory, a symlink). Undefined: GitHub
 * answered, but not with something this reader understands, or the request was malformed.
 */
export const readGitHubFileAtRevision = (
  github: GitHubCli["Service"],
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
  return github
    .execute({
      cwd: input.cwd,
      args: [
        "api",
        "--hostname",
        input.host,
        `repos/${input.repository}/contents/${encodePathSegments(input.path)}?ref=${input.revision}`,
        // Content is dropped by `gh` before it is read when the caller only wants the blob sha.
        "--jq",
        `if type == "array" then {type: "dir", size: 0} else {type, sha, size, encoding, content: (if .size > ${limit} then null else .content end)} end`,
      ],
      maxOutputBytes: outputBudget(limit),
      timeoutMs: TIMEOUT_MS,
    })
    .pipe(
      Effect.map((result) =>
        result.stdoutTruncated
          ? undefined
          : fileFromHostJson(result.stdout.trim(), limit),
      ),
      Effect.catchIf(isNotFound, () =>
        Effect.succeed<ProviderFileAtRevision | null | undefined>(null),
      ),
    );
};
