import type { ComponentType } from "react";

/**
 * The project a pending draft is for, before the environment that will host it exists in the
 * catalog. The app turns it into the placeholder project the draft screen renders with.
 */
export interface PendingDraftProject {
  /** The environment the draft will be sent to (also stamped on the draft). */
  readonly environmentId: string;
  /** The project's id on that environment (also stamped on the draft). */
  readonly id: string;
  readonly title: string;
  /** Leave empty until the checkout exists: the app then skips every workspace read. */
  readonly workspaceRoot?: string;
}

export type PendingDraftTone = "working" | "ready" | "failed";

/** What a distribution knows about one draft whose environment is not ready yet. */
export interface PendingDraft {
  readonly project: PendingDraftProject;
  /** Short live status, shown in the draft's row in the Chats list instead of "Draft". */
  readonly statusLabel: string;
  readonly tone: PendingDraftTone;
  /** Why Send is disabled for now; null once the draft can be sent (or queued). */
  readonly sendBlockedReason: string | null;
  /** Status card above the composer controls; it explains why Send is blocked, so it is required. */
  readonly Card: ComponentType<{ readonly draftKey: string }>;
}

/**
 * Drafts that wait for an environment not in the catalog yet, by draft key; the hook must not
 * throw. Keep a draft in the map until the catalog lists its project, or it returns to the picker.
 * To swap in a real project call `retargetPendingDraft`, then drop the map entry.
 */
export interface PendingDraftSlot {
  readonly usePendingDrafts: () => ReadonlyMap<string, PendingDraft>;
}
