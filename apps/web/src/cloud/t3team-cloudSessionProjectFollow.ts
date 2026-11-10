/**
 * A cloud session is provisioned for the project the composer had when it was created or picked.
 * Switching the composer project mid-setup must not drop that pending VM or its queued first
 * message (Android hive#1073 / fork#842): keep the target attached and bind on first send.
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
  /** True when the composer project differs from the session's stamp; the session still stays. */
  readonly otherProject: boolean;
};

/** Keeps the stored target of `scopeKey` even when the composer project has moved. */
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
