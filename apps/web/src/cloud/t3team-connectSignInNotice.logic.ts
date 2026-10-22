import type { EnvironmentConnectSignInStatus } from "@t3tools/contracts";

export type ConnectSignInNoticeTone = "neutral" | "loading" | "error";

export interface ConnectSignInNoticeView {
  readonly key: string;
  readonly tone: ConnectSignInNoticeTone;
  readonly title: string;
  readonly description: string;
  /** Clicking the notice starts the browser sign-in; null while one is already open. */
  readonly startsSignIn: boolean;
}

export interface ConnectSignInNoticeOptions {
  /** The persisted "T3 Connect sign-in reminder" client setting. */
  readonly enabled: boolean;
  /** Dismissed for this app session; the notice may come back on the next start. */
  readonly dismissed: boolean;
}

/**
 * What the sidebar shows for a linked environment that lacks the T3 Connect sign-in. Never
 * anything that opens a browser by itself: every view needs the user's click to sign in.
 */
export function getConnectSignInNoticeView(
  status: EnvironmentConnectSignInStatus | null,
  options: ConnectSignInNoticeOptions,
): ConnectSignInNoticeView | null {
  if (status === null || !status.required || !options.enabled) return null;
  switch (status.attempt) {
    case "in_progress":
      return {
        key: "in_progress",
        tone: "loading",
        title: "Finish signing in in your browser",
        description: "T3 Connect sign-in is open in your browser.",
        startsSignIn: false,
      };
    case "failed":
      if (options.dismissed) return null;
      return {
        key: "failed",
        tone: "error",
        title: "T3 Connect sign-in didn't finish",
        description: "Click to try again. Nothing retries on its own.",
        startsSignIn: true,
      };
    case "idle":
      if (options.dismissed) return null;
      return {
        key: "idle",
        tone: "neutral",
        title: "Sign in to T3 Connect",
        description:
          "Cloud sessions need your T3 Connect sign-in. Click to open it in your browser.",
        startsSignIn: true,
      };
  }
}

/** While a sign-in is open, poll its status this often; otherwise only on mount and focus. */
export const CONNECT_SIGN_IN_POLL_MS = 3_000;

let dismissedThisSession = false;
const listeners = new Set<() => void>();

/** Hide the notice until the app starts again (the setting hides it for good). */
export function dismissConnectSignInNoticeForSession(): void {
  dismissedThisSession = true;
  for (const listener of listeners) listener();
}

export function isConnectSignInNoticeDismissedForSession(): boolean {
  return dismissedThisSession;
}

export function subscribeConnectSignInNoticeDismissal(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function __resetConnectSignInNoticeDismissalForTests(): void {
  dismissedThisSession = false;
}
