/**
 * Provider-neutral pieces of "read one file at one commit" (`PullRequestProviderApi.
 * readFileAtRevision`), shared by every provider that implements it. The request and the answer
 * are neutral; each host's own JSON is decoded in its own `t3team-<Host>FileAtRevision.ts`.
 */
import type { ProjectId } from "@t3tools/contracts";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { decodeJsonResult } from "@t3tools/shared/schemaJson";

/**
 * What a host has at one path of one commit. `blobSha` is the git blob id the host reports (or
 * the host's own stable file id where it keeps no git objects), so two reads compare equal iff
 * the file content is the same.
 */
export interface ProviderFileAtRevision {
  readonly blobSha: string;
  readonly size: number;
  /**
   * The file's raw bytes, or null when the file is larger than the `maxBytes` the caller asked
   * for. `blobSha` and `size` are reported either way, which is all a staleness check needs.
   */
  readonly content: Uint8Array | null;
}

/** What `PullRequestService.fileAtRevision` is asked: a project's repository, never a cwd. */
export interface PullRequestFileAtRevisionInput {
  readonly projectId: ProjectId;
  readonly repository: string;
  readonly host?: string | undefined;
  readonly revision: string;
  readonly path: string;
  readonly maxBytes: number;
}

export type PullRequestFileAtRevisionResult =
  | { readonly kind: "file"; readonly file: ProviderFileAtRevision }
  | { readonly kind: "missing" }
  /** The host has no way to read a file at a revision (not the same as the file being absent). */
  | { readonly kind: "unsupported" };

export interface FileAtRevisionRequest {
  readonly cwd: string;
  /** Provider-native repository identity, as in `ProviderRepositoryRef`. */
  readonly repository: string;
  readonly host: string;
  /** A full commit sha: never a branch name, so the answer cannot move under the caller. */
  readonly revision: string;
  /** Repository-relative, `/`-separated; see `isSafeRepositoryPath`. */
  readonly path: string;
  readonly maxBytes: number;
}

/** A commit sha arrives from a script and goes into a request path, so it is checked. */
export const isRevisionSha = (value: string): boolean => /^[0-9a-f]{40}([0-9a-f]{24})?$/i.test(value);

/**
 * A path that stays inside the repository: relative, no empty, `.` or `..` segment, no
 * backslash and no control characters. Hosts resolve these themselves, but the path is composed
 * into a request URL, so a traversal is refused here instead of being left to each host.
 */
export function isSafeRepositoryPath(path: string): boolean {
  if (path.length === 0 || path.length > 1024) return false;
  if (path.startsWith("/") || path.includes("\\")) return false;
  // oxlint-disable-next-line no-control-regex -- control characters are exactly what is refused
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export const encodePathSegments = (path: string): string =>
  path.split("/").map(encodeURIComponent).join("/");

/** A repository selector that can be put in a request path: `owner/name` or `group/sub/project`. */
export const isRepositorySelector = (value: string): boolean =>
  /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/.test(value) &&
  value.split("/").every((part) => part !== "." && part !== "..");

const HostFile = Schema.Struct({
  sha: Schema.optional(Schema.String),
  blob_id: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  size: Schema.Number,
  encoding: Schema.optional(Schema.NullOr(Schema.String)),
  content: Schema.optional(Schema.NullOr(Schema.String)),
});
const decodeHostFile = decodeJsonResult(HostFile);

/**
 * One host response (GitHub `contents`, GitLab `repository/files`) as a neutral answer. Null
 * when the response is not a regular file (a directory listing, a symlink, a submodule), which a
 * reader treats as "nothing readable at that path"; undefined when it cannot be read at all.
 */
export function fileFromHostJson(
  raw: string,
  maxBytes: number,
): ProviderFileAtRevision | null | undefined {
  const decoded = decodeHostFile(raw);
  if (!Result.isSuccess(decoded)) {
    // A directory listing is a JSON array, which is not a file rather than an unreadable answer.
    return raw.trimStart().startsWith("[") ? null : undefined;
  }
  const file = decoded.success;
  if (file.type !== undefined && file.type !== "file") return null;
  const blobSha = file.sha ?? file.blob_id;
  if (blobSha === undefined) return undefined;
  const inline = file.encoding === "base64" && file.content != null && file.size <= maxBytes;
  return {
    blobSha,
    size: file.size,
    content:
      file.size === 0
        ? new Uint8Array()
        : inline
          ? new Uint8Array(Buffer.from(file.content!, "base64"))
          : null,
  };
}
