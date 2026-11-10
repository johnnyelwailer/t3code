/**
 * A cloud session keeps the project stamp from create/pick: switching composer projects must
 * not clear the pending VM or queued first message. Other projects hide it; bind is on first send.
 */
import { getDraftCloudQueuedSend } from "./t3team-cloudQueuedSendStore";
import { getCloudSessionTarget, type CloudSessionTarget } from "./t3team-cloudSessionTargetStore";

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

/** True when Run-on / the setup card should show this target for the composer's project. */
export function cloudSessionTargetAppliesToProject(
  target: Pick<CloudSessionTarget, "projectKey"> | null,
  currentProjectKey: string | null,
): boolean {
  return target !== null && !cloudSessionTargetBelongsToOtherProject(target, currentProjectKey);
}

/**
 * A draft with a cloud Run-on target or queued first message keeps that work on its original
 * project/thread: switching projects opens a clean composer instead of retargeting or clearing.
 */
export function draftRetainsPendingCloudSession(scopeKey: string): boolean {
  return getCloudSessionTarget(scopeKey) !== null || getDraftCloudQueuedSend(scopeKey) !== null;
}

export type CloudSessionProjectFollowResult = { readonly kind: "kept" };

/**
 * Always keep the stored target. Clearing on project mismatch cancelled in-flight setup and
 * toasted wrongly; visibility is filtered via `cloudSessionTargetAppliesToProject` instead.
 */
export function followCloudSessionProject(
  scopeKey: string,
  currentProjectKey: string | null,
): CloudSessionProjectFollowResult {
  void scopeKey;
  void currentProjectKey;
  return { kind: "kept" };
}
