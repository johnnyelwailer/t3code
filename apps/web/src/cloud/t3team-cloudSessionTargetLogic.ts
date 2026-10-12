/**
 * Pure helpers for optimistic cloud-session selection in the Run-on control.
 * A pending target is a preference until the first send binds it; the Select
 * trigger uses a sentinel value so it never stays on "This computer".
 */

export const CLOUD_SESSION_CREATING_ID = "__creating__";

export function cloudSessionSelectValue(sessionId: string): string {
  return `__cloud-session:${sessionId}`;
}

export function parseCloudSessionSelectValue(value: string): string | null {
  const prefix = "__cloud-session:";
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

export type CloudSessionBindPhase =
  | "provisioning"
  | "connecting"
  | "syncing"
  | "flushing"
  | "failed";

export function cloudSessionBindBannerTitle(phase: CloudSessionBindPhase): string {
  switch (phase) {
    case "provisioning":
      return "Provisioning cloud session…";
    case "connecting":
      return "Connecting to cloud session…";
    case "syncing":
      return "Syncing project on cloud session…";
    case "flushing":
      return "Sending to cloud session…";
    case "failed":
      return "Cloud session failed";
  }
}

export function resolveCloudSessionBindPhase(input: {
  readonly sessionPhase: string | null;
  readonly connecting: boolean;
  readonly projectReady: boolean;
  readonly flushing: boolean;
  readonly failed: boolean;
}): CloudSessionBindPhase {
  if (input.failed) return "failed";
  if (input.flushing) return "flushing";
  if (input.sessionPhase === null || input.sessionPhase !== "ready") return "provisioning";
  if (input.connecting) return "connecting";
  if (!input.projectReady) return "syncing";
  return "connecting";
}
