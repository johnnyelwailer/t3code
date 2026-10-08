/**
 * Errors and wire shapes of {@link ./t3team-changeRequestPublisher.ts}. Each error's message is the
 * sentence an agent or workflow body reads, so it names the fix as well as the failure.
 *
 * @module t3team-changeRequestPublishErrors
 */
import {
  GitCommandError,
  type GitManagerServiceError,
  type ProjectId,
  type SourceControlProviderKind,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import type * as WorkspacePaths from "./workspace/WorkspacePaths.ts";

export class ChangeRequestPublishInputError extends Schema.TaggedError<ChangeRequestPublishInputError>()(
  "ChangeRequestPublishInputError",
  { field: Schema.String, problem: Schema.String },
) {
  override get message(): string {
    return `Invalid ${this.field}: ${this.problem}`;
  }
}

export class ChangeRequestNothingToCommitError extends Schema.TaggedError<ChangeRequestNothingToCommitError>()(
  "ChangeRequestNothingToCommitError",
  { branch: Schema.String },
) {
  override get message(): string {
    return `Nothing to commit: none of the listed paths has changes, and '${this.branch}' does not exist yet.`;
  }
}

/** Moving the branch now would pull it out from under someone's work in progress. */
export class ChangeRequestBranchBusyError extends Schema.TaggedError<ChangeRequestBranchBusyError>()(
  "ChangeRequestBranchBusyError",
  { branch: Schema.String, detail: Schema.String },
) {
  override get message(): string {
    return `Branch '${this.branch}' is in use: ${this.detail} Finish or leave that first, or pick another branch name.`;
  }
}

/** Whether the remote has the branch could not be read; guessing would fork the change request. */
export class ChangeRequestRemoteUnreadableError extends Schema.TaggedError<ChangeRequestRemoteUnreadableError>()(
  "ChangeRequestRemoteUnreadableError",
  { branch: Schema.String, remoteName: Schema.String, detail: Schema.String },
) {
  override get message(): string {
    return `Could not read '${this.branch}' from ${this.remoteName}: ${this.detail} Check the connection and the sign-in, then run again.`;
  }
}

/** The push or the host call was refused for missing credentials: the fix is the user's sign-in. */
export class ChangeRequestNotSignedInError extends Schema.TaggedError<ChangeRequestNotSignedInError>()(
  "ChangeRequestNotSignedInError",
  { step: Schema.Literals(["push", "open"]), host: Schema.String, detail: Schema.String },
) {
  override get message(): string {
    const failed = this.step === "push" ? "push the branch to" : "open the change request on";
    return `Not signed in: could not ${failed} ${this.host}. ${this.detail}`;
  }
}

export class ChangeRequestPushRejectedError extends Schema.TaggedError<ChangeRequestPushRejectedError>()(
  "ChangeRequestPushRejectedError",
  { branch: Schema.String, remoteName: Schema.String, cause: GitCommandError },
) {
  override get message(): string {
    return `Pushing '${this.branch}' to ${this.remoteName} was rejected.`;
  }
}

export interface ChangeRequestPublishInput {
  /** The thread's checkout; any directory inside the repository. */
  readonly cwd: string;
  /** The thread's project; echoed back so a caller can watch the change request's signals. */
  readonly projectId: ProjectId;
  readonly branch: string;
  /** Target branch; the repository's default branch when absent. */
  readonly base?: string | undefined;
  /** Repository-relative files; a directory commits everything under it. Nothing else is committed. */
  readonly paths: ReadonlyArray<string>;
  readonly commitMessage: string;
  readonly title: string;
  readonly body: string;
  readonly draft?: boolean | undefined;
}

export interface ChangeRequestPublishResult {
  readonly url: string;
  readonly number: number;
  /** `owner/name`; null when the origin URL names no repository path. */
  readonly repository: string | null;
  readonly provider: SourceControlProviderKind;
  readonly branch: string;
  readonly commit: string;
  readonly projectId: ProjectId;
}

export type ChangeRequestPublishError =
  | ChangeRequestPublishInputError
  | ChangeRequestNothingToCommitError
  | ChangeRequestBranchBusyError
  | ChangeRequestRemoteUnreadableError
  | ChangeRequestPushRejectedError
  | ChangeRequestNotSignedInError
  | WorkspacePaths.WorkspacePathOutsideRootError
  | GitCommandError
  | GitManagerServiceError;

/**
 * Whether a failure, or anything in its `cause` chain, is a missing or refused credential. Each
 * provider reports it in its own shape: a `*AuthenticationError` tag (GitHub, GitLab, Azure DevOps
 * CLIs), `failureKind`/`reason` "authentication" (process exits, Forgejo), git's classified
 * `authentication_failed`, or an HTTP 401 (Bitbucket's API).
 */
export function isSignInFailure(error: unknown): boolean {
  for (let cause = error, depth = 0; depth < 6; depth += 1) {
    if (typeof cause !== "object" || cause === null) return false;
    const fields = cause as Record<string, unknown>;
    if (typeof fields._tag === "string" && fields._tag.endsWith("AuthenticationError")) return true;
    if (fields.failureKind === "authentication" || fields.status === 401) return true;
    if (fields.reason === "authentication" || fields.reason === "authentication_failed")
      return true;
    cause = fields.cause;
  }
  return false;
}

/** Git classifies these push failures and then withholds stderr; each needs its own sentence. */
const PUSH_FAILURE_SENTENCES: Partial<Record<string, string>> = {
  host_key_unverified:
    "The host key of the remote is not trusted yet; connect once with ssh to verify it.",
  remote_unreachable: "The remote could not be reached, or the repository does not exist there.",
};

/**
 * The sentence a caller reads. A rejected push and a host failure add what git or the host said,
 * because that part names the fix: a non-fast-forward, a protected branch, `gh auth login`.
 */
export function describeChangeRequestPublishError(error: ChangeRequestPublishError): string {
  switch (error._tag) {
    case "ChangeRequestPushRejectedError":
      return `${error.message} ${
        PUSH_FAILURE_SENTENCES[error.cause.reason ?? ""] ??
        (error.cause.stderr?.trim() || error.cause.detail)
      }`;
    case "SourceControlProviderError":
      return `Could not open the change request on ${error.provider}: ${error.detail}`;
    default:
      return error.message;
  }
}
