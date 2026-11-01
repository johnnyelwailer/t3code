/**
 * Which chat belongs to which context view. The binding itself is the contract's
 * `T3TeamContextBinding`; this derives the one key a view's open draft and active chat live under.
 */
import {
  type EnvironmentId,
  type ProjectId,
  T3TEAM_CONTEXT_BINDING_VERSION,
  type T3TeamContextBinding,
} from "@t3tools/contracts";

/** My Work, over the project its chats are created in (all-projects My Work: the Scratch project). */
export function myWorkContextBinding(projectId: ProjectId): T3TeamContextBinding {
  return { version: T3TEAM_CONTEXT_BINDING_VERSION, kind: "my-work", projectId };
}

function bindingTarget(binding: T3TeamContextBinding): string {
  switch (binding.kind) {
    case "my-work":
    case "project-dashboard":
      return binding.projectId;
    case "work-item":
      return `${binding.projectId}/${binding.workItemKey}`;
    case "change-request": {
      const { repository, number, host } = binding.changeRequest;
      return `${binding.projectId}/${host ?? ""}/${repository}#${number}`;
    }
  }
}

/**
 * One key per binding and environment, used as the composer draft store's logical project key, so
 * a binding has at most one open draft. It has no ":" on purpose: the draft store reads a
 * "<environment>:<project>" shaped key as a project reference when it restores.
 */
export function contextChatBindingKey(
  environmentId: EnvironmentId,
  binding: T3TeamContextBinding,
): string {
  return ["t3team-context-chat", binding.kind, environmentId, bindingTarget(binding)].join("|");
}
