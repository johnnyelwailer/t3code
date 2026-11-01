import type { ProjectShellProject } from "@t3tools/project-context";

import {
  createThreadChatTurnToolContext,
  resolveSelectedToolIds,
} from "~/t3team/chat/t3team-useThreadChatTurnToolContext";
import type { T3TeamTurnToolContext } from "~/t3team/t3team-threadToolContext";
import type { T3TeamKickoffWorkflow, T3TeamThreadToolId } from "~/t3team/t3team-types";

/** What a kickoff surface knows about itself that the thread's tool context is built from. */
export type SidecarLaunchToolContextSource = {
  readonly project: Pick<ProjectShellProject, "id" | "title" | "source" | "workspace">;
  /** Present on the work item surface only. */
  readonly ticketId?: string | undefined;
  readonly ticketDisplayId?: string | undefined;
};

/**
 * The tool context a recipe launched from a kickoff surface gives its thread: the same one the
 * thread's own chat builds (project, ticket, tools, kickoff state with the recipe's launch
 * context), so the launch's `syncThreadToolContext` writes it instead of clearing it.
 */
export function buildSidecarLaunchToolContext(input: {
  readonly source: SidecarLaunchToolContextSource;
  readonly threadId: string;
  readonly title: string;
  readonly kickoffMessage: string;
  readonly kickoffWorkflow: T3TeamKickoffWorkflow | undefined;
  readonly selectedToolIds: ReadonlyArray<T3TeamThreadToolId> | undefined;
}): T3TeamTurnToolContext | undefined {
  const { project } = input.source;
  return createThreadChatTurnToolContext({
    embeddedMode: true,
    kickoffMessage: input.kickoffMessage,
    kickoffPending: true,
    kickoffWorkflow: input.kickoffWorkflow,
    projectId: project.id,
    projectTitle: project.title,
    projectSource: project.source,
    projectWorkspaceRoot: project.workspace?.rootPath,
    selectedToolIds: resolveSelectedToolIds(input.selectedToolIds, input.kickoffWorkflow),
    threadId: input.threadId,
    ticketId: input.source.ticketId,
    ticketDisplayId: input.source.ticketDisplayId,
    title: input.title,
  });
}
