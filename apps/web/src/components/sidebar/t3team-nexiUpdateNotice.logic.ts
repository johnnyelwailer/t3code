import type { DesktopUpdateState } from "@t3tools/contracts";

export type NexiUpdateNoticeAction = "install-now" | "restart-now" | "open-settings" | "retry";

export type NexiUpdateNoticeView =
  | {
      readonly kind: "signed-out" | "unreachable" | "verification-failed";
      readonly title: string;
      readonly description: string;
      readonly action: NexiUpdateNoticeAction;
      readonly actionLabel: string;
      readonly dismissible: false;
    }
  | {
      readonly kind: "available" | "downloaded";
      readonly version: string;
      readonly title: string;
      readonly notes: ReadonlyArray<string>;
      readonly action: NexiUpdateNoticeAction;
      readonly actionLabel: string;
      readonly dismissible: true;
    }
  | { readonly kind: "downloading"; readonly title: string; readonly percent: number | null };

const MAX_NOTES = 4;

/**
 * What the interim Nexi Work update notice shows for a state, or null for nothing. Only states
 * from the GHE feed qualify: upstream builds and nightlies keep the sidebar pill alone. A version
 * the user said "Later" to stays hidden until a newer one comes, but a problem never hides: a
 * missing sign-in or a refused download must be seen.
 */
export function getNexiUpdateNoticeView(
  state: DesktopUpdateState | null,
  dismissedVersion: string | null,
): NexiUpdateNoticeView | null {
  if (!state || state.feed !== "nexi-ghe") return null;

  if (state.status === "error" && state.issue) {
    switch (state.issue) {
      case "signed-out":
        return {
          kind: "signed-out",
          title: "Sign in to GHE to get updates",
          description:
            state.message ?? "Nexi Work gets its updates from GHE with your existing sign-in.",
          action: "open-settings",
          actionLabel: "Open sign-in settings",
          dismissible: false,
        };
      case "unreachable":
        return {
          kind: "unreachable",
          title: "Could not check for updates",
          description: `${state.message ?? "GHE did not answer."} Nexi Work will try again.`,
          action: "retry",
          actionLabel: "Try now",
          dismissible: false,
        };
      case "verification-failed":
        return {
          kind: "verification-failed",
          title: "Update not installed",
          description: state.message ?? "The download could not be verified.",
          action: "retry",
          actionLabel: "Download again",
          dismissible: false,
        };
      case "unsupported":
        return null;
    }
  }
  if (state.issue === "verification-failed" && state.availableVersion !== null) {
    return {
      kind: "verification-failed",
      title: "Update not installed",
      description: state.message ?? "The download could not be verified.",
      action: "retry",
      actionLabel: "Download again",
      dismissible: false,
    };
  }

  if (state.status === "downloading") {
    return {
      kind: "downloading",
      title: `Downloading ${state.availableVersion ?? "the update"}`,
      percent: state.downloadPercent,
    };
  }
  const version = state.downloadedVersion ?? state.availableVersion;
  if (version === null || version === dismissedVersion) return null;
  const notes = state.releaseNotes.flatMap((note) => note.items).slice(0, MAX_NOTES);
  return state.status === "downloaded"
    ? {
        kind: "downloaded",
        version,
        title: `Nexi Work ${version} is ready`,
        notes,
        action: "restart-now",
        actionLabel: "Restart now",
        dismissible: true,
      }
    : state.status === "available"
      ? {
          kind: "available",
          version,
          title: `Nexi Work ${version} is available`,
          notes,
          action: "install-now",
          actionLabel: "Install now",
          dismissible: true,
        }
      : null;
}
