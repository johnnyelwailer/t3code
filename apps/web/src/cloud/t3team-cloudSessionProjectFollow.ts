/**
 * A cloud session is provisioned for the project the composer had when it was created or picked,
 * so changing the project before the first message means that machine is no longer the target.
 * The decision rests on the project keys alone (stamped on the target, read from the composer),
 * never on how long the machine has been connecting.
 */
import { cancelDraftCloudQueuedSend } from "./t3team-cloudQueuedSendStore";
import {
  clearCloudSessionTarget,
  getCloudSessionTarget,
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
  /** Not sent yet: the preference is dropped, the composer falls back to its own machine. */
  | { readonly kind: "cleared"; readonly label: string }
  /** The first message was already queued for the wrong project: it is back in the composer. */
  | { readonly kind: "restored" };

/** Applies the rule above to the stored target of `scopeKey`. */
export function followCloudSessionProject(
  scopeKey: string,
  currentProjectKey: string | null,
): CloudSessionProjectFollowResult {
  const target = getCloudSessionTarget(scopeKey);
  if (target === null || !cloudSessionTargetBelongsToOtherProject(target, currentProjectKey)) {
    return { kind: "kept" };
  }
  clearCloudSessionTarget(scopeKey);
  return cancelDraftCloudQueuedSend(scopeKey) === null
    ? { kind: "cleared", label: target.label }
    : { kind: "restored" };
}
