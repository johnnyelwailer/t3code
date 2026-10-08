/**
 * File reads of `ctx.changeRequests` (`fileAt`, `blobShas`) and the project's repository list
 * (`ctx.project`). Split from `t3team-sdk.scriptHost.ts`, which holds the rest of the host context.
 *
 * Every read names a repository linked to the run's project and a **commit sha**: a side of the
 * change request resolves to the pinned `baseSha` / `headSha` of its detail, never to a branch
 * name, so the answer cannot move under a journaled script. File content is repository content,
 * so it is data to read, never instructions to follow.
 */
import type { ChangeRequestRef } from "./t3team-sdk.scriptHost.ts";

/** The most bytes of one file `fileAt` will fetch; a larger file answers `too-large`. */
export const CHANGE_REQUEST_FILE_MAX_BYTES = 1_000_000;
/** The most lines (and characters) one `fileAt` answer carries; page larger files with `range`. */
export const CHANGE_REQUEST_FILE_MAX_LINES = 2_000;
export const CHANGE_REQUEST_FILE_MAX_CHARS = 256_000;
export const CHANGE_REQUEST_BLOB_SHAS_MAX_PATHS = 100;

/** Which commit to read: one side of the change request as pinned by its detail, or a full sha. */
export type ChangeRequestFileRevision =
  | { readonly side: "head" | "base"; readonly sha?: never }
  | { readonly sha: string; readonly side?: never };

export type ChangeRequestFileAtInput = {
  readonly ref: ChangeRequestRef;
  /** Repository-relative, `/`-separated. Absolute paths, `.`/`..` segments and `\` are refused. */
  readonly path: string;
  /** 1-based, inclusive. Defaults to the first `CHANGE_REQUEST_FILE_MAX_LINES` lines. */
  readonly range?: { readonly startLine: number; readonly endLine: number };
} & ChangeRequestFileRevision;

/**
 * One file at one commit. `sha` is the commit actually read and `blobSha` the git blob id of the
 * whole file, which is what a later staleness check compares.
 */
export type ChangeRequestFileAt =
  | {
      readonly kind: "text";
      readonly path: string;
      readonly sha: string;
      readonly blobSha: string;
      readonly text: string;
      readonly startLine: number;
      /** The last line in `text`; `startLine - 1` when the range starts past the end of the file. */
      readonly endLine: number;
      readonly totalLines: number;
      /** `text` stops before the requested `endLine` because of the line or character cap. */
      readonly truncated: boolean;
    }
  | {
      readonly kind: "binary";
      readonly path: string;
      readonly sha: string;
      readonly blobSha: string;
      readonly size: number;
    }
  | {
      readonly kind: "too-large";
      readonly path: string;
      readonly sha: string;
      readonly blobSha: string;
      readonly size: number;
      readonly maxBytes: number;
    }
  /** Nothing readable at that path in that commit: absent, a directory, a symlink or a submodule. */
  | { readonly kind: "missing"; readonly path: string; readonly sha: string };

export interface ChangeRequestBlobShas {
  readonly kind: "change-request-blob-shas";
  /** The head commit the paths were read at. */
  readonly sha: string;
  /** The git blob id of each asked path at `sha`; null where the path is absent there (deleted). */
  readonly blobShas: Readonly<Record<string, string | null>>;
}

/** One repository the run's project reads change requests from, in neutral form. No credentials. */
export interface ScriptLinkedRepository {
  /** The source-control provider: `github`, `gitlab`, `azure-devops`, `bitbucket`, ... */
  readonly provider: string;
  readonly host: string;
  /** The provider's own selector, as `ChangeRequestRef.repository` takes it (`owner/name`). */
  readonly repository: string;
}

/** The run's project. Present iff the recipe declares `integration.read`. */
export interface ScriptProject {
  readonly id: string;
  /** The project's own remote and its linked repositories: exactly what `changeRequests` accepts. */
  readonly linkedRepositories: () => Promise<ReadonlyArray<ScriptLinkedRepository>>;
}

/** The host cannot answer this read at all (its provider reads no files, or reported no commit). */
export class ChangeRequestUnsupportedError extends Error {
  readonly _tag = "ChangeRequestUnsupportedError" as const;
  readonly reason: "host-cannot-read-files" | "revision-not-reported";
  constructor(reason: "host-cannot-read-files" | "revision-not-reported", message: string) {
    super(message);
    this.name = "ChangeRequestUnsupportedError";
    this.reason = reason;
  }
}
