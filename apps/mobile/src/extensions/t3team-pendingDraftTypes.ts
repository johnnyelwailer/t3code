import type { ComponentType } from "react";

import type { FirstTurnContext } from "../state/t3team-firstTurnContext";

export type { FirstTurnContext };

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
  /**
   * Facts for the agent, attached as a context chip to the turn the draft sends to `project` (or
   * passed to `retargetPendingDraft` for a turn already queued on the placeholder).
   */
  readonly firstTurnContext?: FirstTurnContext;
}

/**
 * Drafts that wait for an environment not in the catalog yet, by draft key; the hook must not
 * throw. Keep a draft in the map while it is pending; the app shows its hold for the draft as long
 * as the entry exists, so it survives the user choosing another project on the draft before the
 * first send. To swap in a real project call `retargetPendingDraft`, then drop the map entry.
 */
export interface PendingDraftSlot {
  readonly usePendingDrafts: () => ReadonlyMap<string, PendingDraft>;
}
