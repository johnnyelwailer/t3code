/**
 * A cloud session's Run-on stamp follows the composer project. Switching projects rebinds this
 * draft's target (and any queued first message) to the new project on the same session; it never
 * clears the session or the message. Other drafts keep their own stamps.
 */
import { getDraftCloudQueuedSend, writeDraftCloudQueuedSend } from "./t3team-cloudQueuedSendStore";
import {
  getCloudSessionTarget,
  selectCloudSessionTarget,
  type CloudSessionTarget,
} from "./t3team-cloudSessionTargetStore";

/** True when the target was stamped for a project and the composer is on a different one. */
export function cloudSessionTargetBelongsToOtherProject(
  target: Pick<CloudSessionTarget, "projectKey">,
  currentProjectKey: string | null,
): boolean {
  return (
    target.projectKey !== null &&
    currentProjectKey !== null &&
    target.projectKey !== currentProjectKey
  );
}

export type CloudSessionProjectFollowResult =
  | { readonly kind: "kept" }
  /** Same session; project stamp (and queued send, if any) now follow the composer. */
  | { readonly kind: "retargeted" };

/**
 * Rebinds this scope's cloud preference to `currentProjectKey` when it was stamped for another
 * project. Leaves other scopes alone; never cancels the session or drops a queued message.
 */
export function followCloudSessionProject(
  scopeKey: string,
  currentProjectKey: string | null,
): CloudSessionProjectFollowResult {
  const target = getCloudSessionTarget(scopeKey);
  if (target === null || !cloudSessionTargetBelongsToOtherProject(target, currentProjectKey)) {
    return { kind: "kept" };
  }
  selectCloudSessionTarget({
    scopeKey,
    sessionId: target.sessionId,
    label: target.label,
    projectKey: currentProjectKey,
  });
  const queued = getDraftCloudQueuedSend(scopeKey);
  if (queued !== null) {
    writeDraftCloudQueuedSend(scopeKey, { ...queued, projectKey: currentProjectKey });
  }
  return { kind: "retargeted" };
}
