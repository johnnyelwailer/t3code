import * as Base64Url from "effect/encoding/Base64Url";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { isInternalDesktopRouteProposal } from "./t3team-desktopRouteInternal.ts";
import { escapeMarkdownText, hasInvisibleFormat } from "./t3team-projectMachineSource.ts";

/**
 * Desktop route: the agent only asks (`request_desktop_route`, a `t3_ask_user` card); the user's own
 * desktop client grants on accept. The question id carries the proposal and the card's first line is
 * derived from it alone, as for the machine source.
 */
export const DESKTOP_ROUTE_QUESTION_PREFIX = "desktop-route:v1:";
export const DESKTOP_ROUTE_QUESTION_HEADER = "Desktop route";

/**
 * Whether an id is in the desktop-route namespace, however malformed: prefix only, case-insensitive.
 * For refusals, which must fail closed even for an id a different version would still decode.
 */
export const isDesktopRouteQuestionIdPrefixed = (id: string): boolean =>
  id.toLowerCase().startsWith(DESKTOP_ROUTE_QUESTION_PREFIX);

/** The four answers. Anything but the first three declines. */
export const DESKTOP_ROUTE_ONCE_LABEL = "Once";
export const DESKTOP_ROUTE_SESSION_LABEL = "For this session";
export const DESKTOP_ROUTE_ALWAYS_LABEL = "Always for this host";
export const DESKTOP_ROUTE_DECLINE_LABEL = "Don't route";

export type DesktopRouteScope = "once" | "session" | "always";
const SCOPE_BY_LABEL: Readonly<Record<string, DesktopRouteScope>> = {
  [DESKTOP_ROUTE_ONCE_LABEL]: "once",
  [DESKTOP_ROUTE_SESSION_LABEL]: "session",
  [DESKTOP_ROUTE_ALWAYS_LABEL]: "always",
};

/**
 * What accepting grants. `target` is one host, URL, IP or small range as the agent wrote it (the
 * desktop's parser decides whether it is allowed). `internal`: the agent says the host is an internal
 * address, so the grant also lets it resolve to a private range; the card says so in words.
 */
export const DesktopRouteProposal = Schema.Struct({
  target: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(300)),
  internal: Schema.Boolean,
});
export type DesktopRouteProposal = typeof DesktopRouteProposal.Type;

const ProposalJson = Schema.fromJsonString(DesktopRouteProposal);
const decodeProposal = Schema.decodeUnknownOption(ProposalJson);
const encodeProposal = Schema.encodeSync(ProposalJson);

export function encodeDesktopRouteQuestionId(proposal: DesktopRouteProposal): string {
  return `${DESKTOP_ROUTE_QUESTION_PREFIX}${Base64Url.encode(encodeProposal(proposal))}`;
}

/**
 * A target as one visible ASCII token: no whitespace, wildcard, credentials, control or look-alike
 * (non-ASCII) characters, nothing that hides or reorders text. International names use punycode.
 */
const plainTarget = (target: string) =>
  !/[\s*@\\]/.test(target) && !hasInvisibleFormat(target) && !/[^\u0021-\u007e]/.test(target);

/** The proposal a question id carries, or null for any other id or a malformed one. Never throws. */
export function decodeDesktopRouteQuestionId(id: string): DesktopRouteProposal | null {
  if (!id.startsWith(DESKTOP_ROUTE_QUESTION_PREFIX)) return null;
  const text = Base64Url.decodeString(id.slice(DESKTOP_ROUTE_QUESTION_PREFIX.length));
  if (!Result.isSuccess(text)) return null;
  const proposal = decodeProposal(text.success);
  if (proposal._tag !== "Some" || !plainTarget(proposal.value.target)) return null;
  return proposal.value;
}

/**
 * The first line of the card, derived from the proposal alone. The client applies an accepted answer
 * only when the question starts with this exact line, so a card cannot say one thing and grant another.
 */
export function desktopRouteQuestionLine(proposal: DesktopRouteProposal): string {
  const where = escapeMarkdownText(proposal.target);
  const internal = proposal.internal
    ? " It is an internal address: it may resolve to a private network address."
    : "";
  return `Let this cloud session reach ${where} through your computer?${internal}`;
}

/**
 * What the user accepted, from the questions of a request they just answered and their answers
 * (keyed by question id). Null for anything else: a decline, other answer text, a question that is
 * not a desktop-route proposal, or one whose card does not show what it would grant.
 */
export function desktopRouteAcceptedFrom(
  questions: ReadonlyArray<{
    readonly id: string;
    readonly header?: string | undefined;
    readonly question?: string | undefined;
    readonly multiSelect?: boolean | undefined;
  }>,
  answers: Record<string, unknown>,
): {
  readonly target: string;
  readonly internal: boolean;
  readonly scope: DesktopRouteScope;
} | null {
  for (const question of questions) {
    if (question.multiSelect === true) continue;
    const proposal = decodeDesktopRouteQuestionId(question.id);
    const answer = answers[question.id];
    if (proposal === null || typeof answer !== "string") continue;
    const shown =
      question.header === DESKTOP_ROUTE_QUESTION_HEADER &&
      question.question?.startsWith(desktopRouteQuestionLine(proposal)) === true;
    const scope = SCOPE_BY_LABEL[answer.trim()];
    // "Always" on an internal host would let a name the agent controls reach any private address later.
    const refused = scope === "always" && isInternalDesktopRouteProposal(proposal);
    return shown && scope !== undefined && !refused ? { ...proposal, scope } : null;
  }
  return null;
}
