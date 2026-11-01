import {
  DESKTOP_ROUTE_ALWAYS_LABEL,
  DESKTOP_ROUTE_DECLINE_LABEL,
  DESKTOP_ROUTE_ONCE_LABEL,
  DESKTOP_ROUTE_QUESTION_HEADER,
  DESKTOP_ROUTE_SESSION_LABEL,
  decodeDesktopRouteQuestionId,
  desktopRouteQuestionLine,
} from "./t3team-desktopRoute.ts";
import { isInternalDesktopRouteProposal } from "./t3team-desktopRouteInternal.ts";

const REASON_MARKER = "Why: ";

/** What the specialised card shows, derived from the question alone; the same for web and mobile. */
export interface DesktopRouteCard {
  readonly target: string;
  /** The agent's flag or the address says internal; the agent can never clear it. */
  readonly internal: boolean;
  /** Plain text, never markdown; empty when the agent gave none. */
  readonly reason: string;
  /** The answers this card offers, as the labels the question's options carry. */
  readonly actions: {
    readonly once: string | null;
    readonly session: string | null;
    readonly always: string | null;
    readonly decline: string | null;
  };
}

const unescapeMarkdown = (text: string) => text.replace(/\\([\\`*_{}[\]()#+!|<>~:@.])/g, "$1");

/**
 * The card for a desktop-route question, or null for any other question or one whose text does not
 * show what its id would grant (then the generic card renders and nothing is applied either).
 * "Always" is offered only for a public host.
 */
export function desktopRouteCardFrom(question: {
  readonly id: string;
  readonly header?: string | undefined;
  readonly question?: string | undefined;
  readonly multiSelect?: boolean | undefined;
  readonly options: ReadonlyArray<{ readonly label: string }>;
}): DesktopRouteCard | null {
  const proposal = decodeDesktopRouteQuestionId(question.id);
  if (proposal === null || question.multiSelect === true) return null;
  const text = question.question ?? "";
  if (
    question.header !== DESKTOP_ROUTE_QUESTION_HEADER ||
    !text.startsWith(desktopRouteQuestionLine(proposal))
  ) {
    return null;
  }
  const internal = isInternalDesktopRouteProposal(proposal);
  const offered = (label: string) =>
    question.options.some((option) => option.label === label) ? label : null;
  const at = text.indexOf(REASON_MARKER);
  const reason =
    at < 0
      ? ""
      : unescapeMarkdown((text.slice(at + REASON_MARKER.length).split("\n\n")[0] ?? "").trim());
  return {
    target: proposal.target,
    internal,
    reason,
    actions: {
      once: offered(DESKTOP_ROUTE_ONCE_LABEL),
      session: offered(DESKTOP_ROUTE_SESSION_LABEL),
      always: internal ? null : offered(DESKTOP_ROUTE_ALWAYS_LABEL),
      decline: offered(DESKTOP_ROUTE_DECLINE_LABEL),
    },
  };
}

/** The card for a request that is exactly one desktop-route question; any other request is generic. */
export function desktopRouteCardOf(
  questions: ReadonlyArray<Parameters<typeof desktopRouteCardFrom>[0]>,
): DesktopRouteCard | null {
  const [only] = questions;
  return questions.length === 1 && only !== undefined ? desktopRouteCardFrom(only) : null;
}
