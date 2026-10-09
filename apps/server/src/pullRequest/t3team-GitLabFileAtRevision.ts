/**
 * `readFileAtRevision` for GitLab: the `repository/files` API at a commit sha, which answers with
 * the file's blob id, size and base64 content. A read that wants no content (`maxBytes` 0, the
 * blob-sha staleness check) is a HEAD, which answers with the same blob id and size as headers.
 */
import * as Effect from "effect/Effect";

import type { GitLabCli } from "../sourceControl/GitLabCli.ts";
import {
  fileFromHostJson,
  isRepositorySelector,
  isRevisionSha,
  isSafeRepositoryPath,
  type FileAtRevisionRequest,
  type ProviderFileAtRevision,
} from "./t3team-fileAtRevision.ts";

const TIMEOUT_MS = 60_000;
/**
 * A GET always answers with the content, so the budget is the largest file `fileAt` will ever ask
 * for (base64 plus envelope). A file past it is `undefined` (not understood), never a short read.
 */
const OUTPUT_BUDGET = Math.ceil(1_000_000 * 1.4) + 64 * 1024;
/** Status line and headers of a HEAD answer, with room to spare. */
const HEAD_OUTPUT_BUDGET = 16 * 1024;

/** `glab` reports a 404 as a command failure whose cause the process runner classed `not-found`. */
const isNotFound = (error: { readonly _tag: string; readonly cause?: unknown }) =>
  (error._tag === "GitLabCliCommandError" || error._tag === "GitLabMergeRequestNotFoundError") &&
  (error.cause as { readonly failureKind?: string } | undefined)?.failureKind === "not-found";

/** The blob id and size from a `glab api --include` HEAD answer; undefined if either is absent. */
function fileFromHeadHeaders(raw: string): ProviderFileAtRevision | undefined {
  const header = (name: string) => new RegExp(`^${name}:[ \\t]*(.+?)\\s*$`, "im").exec(raw)?.[1];
  const blobSha = header("x-gitlab-blob-id");
  const size = Number(header("x-gitlab-size"));
  return blobSha === undefined || !Number.isSafeInteger(size) || size < 0
    ? undefined
    : { blobSha, size, content: size === 0 ? new Uint8Array() : null };
}

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
  const endpoint = `projects/${encodeURIComponent(input.repository)}/repository/files/${encodeURIComponent(input.path)}?ref=${input.revision}`;
  const metadataOnly = limit === 0;
  return gitlab
    .execute({
      cwd: input.cwd,
      args: metadataOnly
        ? ["api", "--hostname", input.host, "--method", "HEAD", "--include", endpoint]
        : ["api", "--hostname", input.host, endpoint],
      maxOutputBytes: metadataOnly ? HEAD_OUTPUT_BUDGET : OUTPUT_BUDGET,
      timeoutMs: TIMEOUT_MS,
    })
    .pipe(
      Effect.map((result) =>
        result.stdoutTruncated
          ? undefined
          : metadataOnly
            ? fileFromHeadHeaders(result.stdout)
            : fileFromHostJson(result.stdout.trim(), limit),
      ),
      Effect.catchIf(isNotFound, () =>
        Effect.succeed<ProviderFileAtRevision | null | undefined>(null),
      ),
    );
};
