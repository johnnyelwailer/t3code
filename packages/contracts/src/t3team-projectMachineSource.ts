import * as Base64Url from "effect/encoding/Base64Url";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * Where a project's machine definition is looked for, when the user chose it: a repository and a
 * branch. Both optional: no repository means the project's own, no branch the repository's default.
 * Only names are stored; a repository with credentials in its URL is rejected, so a token can
 * never end up in the setting.
 */
export const ProjectMachineSourceSetting = Schema.Struct({
  /** `https://host/owner/repo(.git)`, or `owner/repo` on the project's own host. */
  repository: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(300))),
  branch: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(255))),
});
export type ProjectMachineSourceSetting = typeof ProjectMachineSourceSetting.Type;

/** `source: null` resets to the default (the project's own repository, its default branch). */
export const ProjectMachineSourceSetInput = Schema.Struct({
  projectId: ProjectId,
  source: Schema.NullOr(ProjectMachineSourceSetting),
});
export type ProjectMachineSourceSetInput = typeof ProjectMachineSourceSetInput.Type;

/** Where the machine definition was read from, as shown in the session setup. */
export const ProjectMachineSourceReadout = Schema.Struct({
  /** `owner/repo` on `host`. */
  repository: TrimmedNonEmptyString,
  host: TrimmedNonEmptyString,
  /** Null: the repository's default branch (or the project's checked-out branch). */
  branch: Schema.NullOr(TrimmedNonEmptyString),
  /** The commit a remote scan read; null for a local checkout. */
  commit: Schema.NullOr(TrimmedNonEmptyString),
  /** The user's saved choice, or null for the default. */
  override: Schema.NullOr(ProjectMachineSourceSetting),
});
export type ProjectMachineSourceReadout = typeof ProjectMachineSourceReadout.Type;

/** The question the machine-setup agent asks before a machine source is proposed to the user. */
export const MACHINE_SOURCE_QUESTION_PREFIX = "machine-source:v1:";
/** The two answers of that question; the web client applies the proposal only on the first. */
export const MACHINE_SOURCE_ACCEPT_LABEL = "Use this machine definition";
export const MACHINE_SOURCE_DECLINE_LABEL = "Keep the default";

const ProposalJson = Schema.fromJsonString(ProjectMachineSourceSetting);
const decodeProposal = Schema.decodeUnknownOption(ProposalJson);
const encodeProposal = Schema.encodeSync(ProposalJson);

/**
 * The question id carrying a proposal: `machine-source:v1:<base64url JSON of the setting>`. The id
 * is the machine-readable form of the proposal, so the client that shows the question can apply
 * the user's answer without parsing prose.
 */
export function encodeMachineSourceQuestionId(setting: ProjectMachineSourceSetting): string {
  return `${MACHINE_SOURCE_QUESTION_PREFIX}${Base64Url.encode(encodeProposal(setting))}`;
}

/**
 * The proposal a question id carries, or null for any other id or a malformed one. Never throws.
 * A repository with credentials, a query or a fragment is refused, so a token cannot ride in an id.
 */
export function decodeMachineSourceQuestionId(id: string): ProjectMachineSourceSetting | null {
  if (!id.startsWith(MACHINE_SOURCE_QUESTION_PREFIX)) return null;
  const text = Base64Url.decodeString(id.slice(MACHINE_SOURCE_QUESTION_PREFIX.length));
  if (!Result.isSuccess(text)) return null;
  const setting = decodeProposal(text.success);
  if (setting._tag !== "Some") return null;
  const { repository, branch } = setting.value;
  if (repository === undefined && branch === undefined) return null;
  if (repository !== undefined) {
    const url = URL.parse(repository);
    if (
      url === null ||
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return null;
    }
  }
  return setting.value;
}
