import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";

export type LinkedRepositorySyncStatusView = {
  readonly label: string;
  readonly tone: "muted" | "progress" | "ready" | "error";
  readonly detail?: string;
};

/** A clone or fetch is queued or running on the server. */
export const isLinkedRepositorySyncActive = (entry: LinkedRepositorySyncResult): boolean =>
  entry.syncState !== undefined;

/** One line describing a linked repository's checkout, for the repository list. */
export function describeLinkedRepositorySyncStatus(
  entry: LinkedRepositorySyncResult,
): LinkedRepositorySyncStatusView {
  switch (entry.syncState) {
    case "queued":
      return { label: "Waiting to sync", tone: "progress" };
    case "cloning":
      return { label: "Cloning…", tone: "progress" };
    case "updating":
      return { label: "Updating…", tone: "progress" };
    default:
      break;
  }
  if (entry.status === "failed") {
    return { label: "Sync failed", tone: "error", ...(entry.error ? { detail: entry.error } : {}) };
  }
  if (entry.status === "pending") return { label: "Not cloned yet", tone: "muted" };
  if (entry.error) {
    return { label: "Ready · last update failed", tone: "error", detail: entry.error };
  }
  return { label: "Ready", tone: "ready" };
}
