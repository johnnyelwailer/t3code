import type { DesktopUpdateState } from "@t3tools/contracts";

export type NexiAboutActionKind =
  | "install-now"
  | "restart-now"
  | "open-sign-in"
  | "retry"
  | "check";

export interface NexiAboutStatus {
  /** One line naming the state; "Up to date" appears only after a check that succeeded. */
  readonly label: string;
  readonly detail: string;
  readonly tone: "neutral" | "ok" | "warn" | "error";
  readonly action: { readonly kind: NexiAboutActionKind; readonly label: string } | null;
}

const MINUTE = 60_000;

/** "just now", "5 min ago", "3 h ago", else the UTC time: a check is only worth showing if it can be read. */
export function formatLastChecked(checkedAt: string | null, now: Date): string | null {
  if (checkedAt === null) return null;
  const then = Date.parse(checkedAt);
  if (Number.isNaN(then)) return null;
  const age = now.getTime() - then;
  if (age < MINUTE) return "just now";
  if (age < 60 * MINUTE) return `${Math.floor(age / MINUTE)} min ago`;
  if (age < 24 * 60 * MINUTE) return `${Math.floor(age / (60 * MINUTE))} h ago`;
  return `${checkedAt.slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * What About says about updates for a build that updates from the GHE releases, or null for any
 * other build (upstream's own status then stands). Every state of the updater has its own words;
 * there is no "up to date" without a check that finished, and none after a problem.
 */
export function getNexiAboutStatus(state: DesktopUpdateState | null): NexiAboutStatus | null {
  if (!state || state.feed !== "nexi-ghe" || !state.enabled || state.status === "disabled") {
    return null;
  }
  const version = state.downloadedVersion ?? state.availableVersion;

  if (state.issue === "verification-failed") {
    return {
      label: "Update not installed",
      detail: state.message ?? "The download could not be verified.",
      tone: "error",
      action: { kind: "install-now", label: "Download again" },
    };
  }
  if (state.status === "error") {
    switch (state.issue) {
      case "signed-out":
        return {
          label: "Signed out of GHE",
          detail: "Nexi Work reads its updates from GHE with your existing sign-in.",
          tone: "warn",
          action: { kind: "open-sign-in", label: "Sign in to GHE" },
        };
      case "unreachable":
        return {
          label: "Could not reach GHE",
          detail: "The check failed; Nexi Work will try again by itself.",
          tone: "warn",
          action: { kind: "retry", label: "Try now" },
        };
      default:
        return {
          label: "Update check failed",
          detail: state.message ?? "The check did not finish.",
          tone: "error",
          action: { kind: "retry", label: "Try now" },
        };
    }
  }
  switch (state.status) {
    case "checking":
      return {
        label: "Checking GHE…",
        detail: "Looking for a newer Nexi Work release.",
        tone: "neutral",
        action: null,
      };
    case "downloading":
      return {
        label: `Downloading ${version ?? "the update"}`,
        detail:
          state.downloadPercent === null ? "Starting…" : `${Math.round(state.downloadPercent)}%`,
        tone: "neutral",
        action: null,
      };
    case "downloaded":
      return {
        label: `Ready to install ${version ?? ""}`.trim(),
        detail: "Restart Nexi Work to finish the update.",
        tone: "ok",
        action: { kind: "restart-now", label: "Restart now" },
      };
    case "available":
      return {
        label: `Update available: ${version ?? ""}`.trim(),
        detail: "Install now downloads it, checks its checksum and restarts.",
        tone: "ok",
        action: { kind: "install-now", label: "Install now" },
      };
    case "up-to-date":
      return state.checkedAt === null
        ? {
            label: "Not checked yet",
            detail: "No check has finished in this session.",
            tone: "neutral",
            action: { kind: "check", label: "Check now" },
          }
        : {
            label: "Up to date",
            detail: "The last check against GHE found nothing newer.",
            tone: "ok",
            action: null,
          };
    default:
      return {
        label: "Not checked yet",
        detail: "Nexi Work checks GHE on start and every few hours.",
        tone: "neutral",
        action: { kind: "check", label: "Check now" },
      };
  }
}
