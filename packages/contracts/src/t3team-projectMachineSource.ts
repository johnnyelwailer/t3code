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

/** `new URL` without the throw: `URL.parse` is missing on some mobile runtimes. */
const parseUrl = (text: string): URL | null => {
  try {
    return new URL(text);
  } catch {
    return null;
  }
};

/**
 * Text shown on the confirmation card as plain text: the card renders markdown, and a field the
 * agent wrote (or a branch name) must not restyle it, link elsewhere or auto-link a URL.
 */
export const escapeMarkdownText = (text: string): string =>
  text
    // `:` keeps `https://` from auto-linking, `@` an e-mail address, and `www.` links without either.
    .replace(/[\\`*_{}[\]()#+!|<>~:@]/g, "\\$&")
    .replace(/www\./gi, (match) => `${match.slice(0, -1)}\\.`);

/** Bidi controls and zero-width or format characters: they reorder or hide text on a card. */
const INVISIBLE_FORMAT = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/;

export const hasInvisibleFormat = (text: string): boolean => INVISIBLE_FORMAT.test(text);

/** Drops them from text an agent wrote, so a card shows what it says. */
export const stripInvisibleFormat = (text: string): string =>
  text.replace(new RegExp(INVISIBLE_FORMAT.source, "g"), "");

/** The card's header: part of what the client requires before it applies an accepted answer. */
export const MACHINE_SOURCE_QUESTION_HEADER = "Machine source";

/**
 * The first line of the card, derived from the proposal alone: it names the host, repository and
 * branch that accepting saves. The client applies an accepted answer only when the question starts
 * with this exact line, so a card cannot say one thing and save another. A different host than the
 * project's own is visible here because the host is always part of the line.
 */
export function machineSourceQuestionLine(setting: ProjectMachineSourceSetting): string {
  const url = setting.repository === undefined ? null : parseUrl(setting.repository);
  const where =
    url === null ? "this project's repository" : `${url.host}${url.pathname.replace(/\.git$/, "")}`;
  const branch = setting.branch === undefined ? "" : ` on branch ${setting.branch}`;
  return escapeMarkdownText(`Use ${where}${branch} for this project's cloud machine?`);
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
  if (branch !== undefined && hasInvisibleFormat(branch)) return null;
  if (repository !== undefined) {
    const url = parseUrl(repository);
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

/**
 * The machine source the user accepted, from the questions of a request they just answered and
 * their answers (keyed by question id). Null for anything else: a declined proposal, other answer
 * text, a question that is not a machine-source proposal, or a multiple-choice shape. Shared by
 * the clients that answer the card (web saves it, mobile says it was not saved).
 */
export function machineSourceAcceptedFrom(
  questions: ReadonlyArray<{
    readonly id: string;
    readonly header?: string | undefined;
    readonly question?: string | undefined;
    readonly multiSelect?: boolean | undefined;
  }>,
  answers: Record<string, unknown>,
): ProjectMachineSourceSetting | null {
  for (const question of questions) {
    if (question.multiSelect === true) continue;
    const proposal = decodeMachineSourceQuestionId(question.id);
    const answer = answers[question.id];
    if (proposal !== null && typeof answer === "string") {
      // Any card can carry any question id: apply only one that shows what it would save.
      const shown =
        question.header === MACHINE_SOURCE_QUESTION_HEADER &&
        question.question?.startsWith(machineSourceQuestionLine(proposal)) === true;
      return shown && answer.trim() === MACHINE_SOURCE_ACCEPT_LABEL ? proposal : null;
    }
  }
  return null;
}
