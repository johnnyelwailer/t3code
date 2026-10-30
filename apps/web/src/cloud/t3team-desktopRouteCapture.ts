import {
  type CloudSession,
  type DesktopRouteScope,
  type EnvironmentId,
  desktopRouteAcceptedFrom,
} from "@t3tools/contracts";

/** What the desktop will be asked to grant, fixed at the moment the user submits the answer. */
export interface DesktopRouteGrant {
  readonly session: string;
  readonly target: string;
  readonly scope: DesktopRouteScope;
  readonly allowPrivate: boolean;
}

/**
 * An accepted desktop-route proposal and the cloud session it is for, or why there is none. The
 * session is the one this thread's environment belongs to, found among the user's own cloud
 * sessions: never a value the question or the agent supplies. Null for any answer that is not an
 * accepted proposal.
 */
export function captureDesktopRouteApply(input: {
  readonly questions: Parameters<typeof desktopRouteAcceptedFrom>[0];
  readonly answers: Record<string, unknown>;
  readonly threadEnvironmentId: EnvironmentId;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly sessions: ReadonlyArray<Pick<CloudSession, "sessionId" | "environmentId">>;
}):
  | { readonly grant: DesktopRouteGrant }
  | { readonly grant: null; readonly problem: string }
  | null {
  const accepted = desktopRouteAcceptedFrom(input.questions, input.answers);
  if (accepted === null) return null;
  if (input.threadEnvironmentId === input.primaryEnvironmentId) {
    return {
      grant: null,
      problem: "This thread runs on your own computer, so there is nothing to route.",
    };
  }
  const matches = input.sessions.filter(
    (session) => session.environmentId === input.threadEnvironmentId,
  );
  const [only] = matches;
  if (matches.length !== 1 || only === undefined) {
    return {
      grant: null,
      problem: "This cloud session was not found among your sessions, so nothing was granted.",
    };
  }
  return {
    grant: {
      session: only.sessionId,
      target: accepted.target,
      scope: accepted.scope,
      allowPrivate: accepted.internal,
    },
  };
}
