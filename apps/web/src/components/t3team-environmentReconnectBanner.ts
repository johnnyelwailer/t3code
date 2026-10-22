import { ENVIRONMENT_RECONNECT_WARNING_GRACE_MS } from "./ChatView.logic";

/**
 * The local backend runs on this machine. When it restarts (watchdog respawn,
 * a crash under memory pressure, an update) it is usually back within a few
 * seconds, so a "<this PC> is reconnecting" warning after 2 s reads like a
 * network problem with the user's own machine. Wait longer before saying
 * anything, and then say what is actually happening.
 */
export const LOCAL_ENVIRONMENT_RECONNECT_NOTICE_GRACE_MS = 30_000;

type EnvironmentConnectionPhaseForBanner =
  | "available"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"
  | (string & {});

export function environmentReconnectGraceMs(isLocal: boolean): number {
  return isLocal
    ? LOCAL_ENVIRONMENT_RECONNECT_NOTICE_GRACE_MS
    : ENVIRONMENT_RECONNECT_WARNING_GRACE_MS;
}

interface EnvironmentUnavailableBannerCopy {
  readonly variant: "default" | "warning" | "error";
  readonly title: string;
  /** Show the manual Reconnect action. */
  readonly showReconnect: boolean;
  /** Quiet notices use a spinner-like icon instead of the offline icon. */
  readonly quiet: boolean;
}

/**
 * Copy for the composer banner when the thread's environment is not
 * connected. Remote environments keep the upstream wording. The local
 * backend never reports "<host> is reconnecting": while it comes back it gets
 * a quiet "Local server is restarting" notice, and only a hard failure is a
 * warning or error.
 */
export function resolveEnvironmentUnavailableBannerCopy(input: {
  readonly label: string;
  readonly phase: EnvironmentConnectionPhaseForBanner;
  readonly isLocal: boolean;
}): EnvironmentUnavailableBannerCopy {
  const reconnecting = input.phase === "connecting" || input.phase === "reconnecting";
  if (input.isLocal) {
    if (reconnecting) {
      return {
        variant: "default",
        title: "Local server is restarting…",
        showReconnect: false,
        quiet: true,
      };
    }
    return {
      variant: input.phase === "error" ? "error" : "warning",
      title: "Local server isn't responding",
      showReconnect: true,
      quiet: false,
    };
  }
  return {
    variant: input.phase === "error" ? "error" : "warning",
    title: `${input.label} is ${reconnecting ? "reconnecting" : "offline"}`,
    showReconnect: !reconnecting,
    quiet: false,
  };
}
