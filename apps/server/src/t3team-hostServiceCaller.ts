import type { HostServiceCaller } from "@t3team/pack-api";

import type { AuthenticatedSession } from "./auth/EnvironmentAuth.ts";

/** The subject the desktop bootstrap grant gives the desktop app's own session; the server sets it, a client cannot choose it. */
const DESKTOP_SESSION_SUBJECT = "desktop-bootstrap";

/**
 * The caller of a host service, from the session the server authenticated. A phone pairs with a
 * one-time link and a browser has a cookie session: neither carries the desktop subject, however it
 * describes itself in its client metadata.
 */
export function hostServiceCaller(
  session: Pick<AuthenticatedSession, "subject">,
): HostServiceCaller {
  return { desktop: session.subject === DESKTOP_SESSION_SUBJECT };
}
