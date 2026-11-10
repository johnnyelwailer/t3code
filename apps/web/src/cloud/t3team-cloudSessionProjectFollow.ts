/**
 * Pending cloud setup stays attached across composer project switches. Project checkout binds
 * when the first message is queued (confirmed selection); until then a switch is a no-op.
 */
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

export type CloudSessionProjectFollowResult = {
  readonly kind: "kept";
  /** Composer project differs from any early stamp; the session still stays. */
  readonly otherProject: boolean;
};

/** Keeps the stored target of `scopeKey`; never clears or cancels on project switch. */
export function followCloudSessionProject(
  scopeKey: string,
  currentProjectKey: string | null,
): CloudSessionProjectFollowResult {
  const target = getCloudSessionTarget(scopeKey);
  if (target === null) return { kind: "kept", otherProject: false };
  return {
    kind: "kept",
    otherProject: cloudSessionTargetBelongsToOtherProject(target, currentProjectKey),
  };
}
