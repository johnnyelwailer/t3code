/**
 * My Work's Chat tab body. The all-projects My Work has no project of its own, so its chats are
 * bound to the environment's Scratch project (where the kickoff chat already lives). Until that
 * project exists the previous kickoff, which offers to create it, stays the body.
 */
import { ProjectId, type EnvironmentId } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { ReactNode } from "react";

import { MY_WORK_PANEL_REF } from "~/rightPanelStore";

import { myWorkContextBinding } from "./t3team-contextChatBinding";
import { ContextChatPane } from "./t3team-ContextChatPane";

export function MyWorkContextChatTab(props: {
  readonly scratchProject: ProjectShellProject | null;
  readonly environmentId: EnvironmentId | null;
  readonly fallback: ReactNode;
}) {
  const { scratchProject, environmentId } = props;
  if (scratchProject === null || environmentId === null) return props.fallback;
  return (
    <ContextChatPane
      key={`${environmentId}|${scratchProject.id}`}
      environmentId={environmentId}
      binding={myWorkContextBinding(ProjectId.make(scratchProject.id))}
      hostRef={MY_WORK_PANEL_REF}
    />
  );
}
