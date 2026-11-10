/**
 * Pending cloud setup stays on the same machine when the composer project changes.
 * The waiting thread and any queued first message move to the new project. If that
 * project is not on the machine, the caller adds it with addProjectToMachine.
 */
import { getDraftCloudQueuedSend, updateDraftCloudQueuedSend } from "./t3team-cloudQueuedSendStore";
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

export type FollowCloudSessionProjectOptions = {
  /** Draft that holds the queued first message; defaults to `scopeKey`. */
  readonly draftId?: string | null;
  /** False when the new project is not already on the session's machine. */
  readonly machineHasProject?: boolean;
  readonly moveThread?: (input: {
    readonly scopeKey: string;
    readonly draftId: string;
    readonly projectKey: string;
    readonly sessionId: string;
  }) => void;
  readonly addProjectToMachine?: (input: {
    readonly scopeKey: string;
    readonly draftId: string;
    readonly projectKey: string;
    readonly sessionId: string;
  }) => void;
};

export type CloudSessionProjectFollowResult =
  | { readonly kind: "kept"; readonly otherProject: false }
  | {
      readonly kind: "retargeted";
      readonly otherProject: true;
      readonly sessionId: string;
      readonly projectKey: string;
      readonly addedProject: boolean;
    };

/**
 * Moves the stored target and any queued first message of `scopeKey` onto
 * `currentProjectKey`, keeping the same session. Never clears or cancels.
 */
export function followCloudSessionProject(
  scopeKey: string,
  currentProjectKey: string | null,
  options?: FollowCloudSessionProjectOptions,
): CloudSessionProjectFollowResult {
  const target = getCloudSessionTarget(scopeKey);
  if (
    target === null ||
    currentProjectKey === null ||
    !cloudSessionTargetBelongsToOtherProject(target, currentProjectKey)
  ) {
    return { kind: "kept", otherProject: false };
  }
  const projectKey = currentProjectKey;
  const draftId = options?.draftId ?? scopeKey;
  selectCloudSessionTarget({
    scopeKey,
    sessionId: target.sessionId,
    label: target.label,
    projectKey,
  });
  const queued = getDraftCloudQueuedSend(draftId);
  if (queued !== null) {
    updateDraftCloudQueuedSend(draftId, queued.messageId, (current) => ({
      ...current,
      projectKey,
    }));
  }
  const moveInput = { scopeKey, draftId, projectKey, sessionId: target.sessionId };
  options?.moveThread?.(moveInput);
  const addedProject = options?.machineHasProject === false;
  if (addedProject) options?.addProjectToMachine?.(moveInput);
  return {
    kind: "retargeted",
    otherProject: true,
    sessionId: target.sessionId,
    projectKey,
    addedProject,
  };
}
