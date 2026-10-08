/**
 * `readFileAtRevision` for GitLab: the `repository/files` API at a commit sha, which answers with
 * the file's blob id, size and base64 content.
 */
import * as Effect from "effect/Effect";

import type { GitLabCli } from "../sourceControl/GitLabCli.ts";
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

/** `glab` reports a 404 as a command failure whose cause the process runner classed `not-found`. */
const isNotFound = (error: { readonly _tag: string; readonly cause?: unknown }) =>
  (error._tag === "GitLabCliCommandError" || error._tag === "GitLabMergeRequestNotFoundError") &&
  (error.cause as { readonly failureKind?: string } | undefined)?.failureKind === "not-found";

/** As `readGitHubFileAtRevision`: null is "nothing readable here", undefined is "not understood". */
export const readGitLabFileAtRevision = (
  gitlab: GitLabCli["Service"],
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
  return gitlab
    .execute({
      cwd: input.cwd,
      args: [
        "api",
        `projects/${encodeURIComponent(input.repository)}/repository/files/${encodeURIComponent(input.path)}?ref=${input.revision}`,
      ],
      maxOutputBytes: Math.ceil(limit * 1.4) + 64 * 1024,
      timeoutMs: TIMEOUT_MS,
    })
    .pipe(
      Effect.map((result) =>
        result.stdoutTruncated ? undefined : fileFromHostJson(result.stdout.trim(), limit),
      ),
      Effect.catchIf(isNotFound, () =>
        Effect.succeed<ProviderFileAtRevision | null | undefined>(null),
      ),
    );
};
