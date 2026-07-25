import type { ProjectShellProject } from "@t3tools/project-context";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { buildTicketSidebarAddToChatRequest } from "~/t3team/components/t3team-projectSidebarAddToChatRequests";
import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function buildEmbeddedTicketThreadAutoAttachKey(input: {
  threadId: string;
  project: ProjectShellProject;
  ticket: ProjectTicket;
}): string {
  return `${input.threadId}:${input.project.id}:${input.ticket.id}`;
}

export function takeEmbeddedTicketThreadAutoAttach(input: {
  seenKeys: Set<string>;
  threadId: string;
  backend: BackendApi;
  project: ProjectShellProject;
  ticket: ProjectTicket;
  projectTickets: ReadonlyArray<ProjectTicket>;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
}): {
  request: AddToChatRequest;
  target: {
    type: "thread";
    threadId: string;
  };
} | null {
  const key = buildEmbeddedTicketThreadAutoAttachKey({
    threadId: input.threadId,
    project: input.project,
    ticket: input.ticket,
  });
  if (input.seenKeys.has(key)) {
    return null;
  }

  input.seenKeys.add(key);

  return {
    request: buildTicketSidebarAddToChatRequest({
      backend: input.backend,
      project: input.project,
      projectId: input.project.id,
      projectTickets: input.projectTickets,
      ticket: input.ticket,
      githubActivityItems: input.githubActivityItems,
    }),
    target: {
      type: "thread",
      threadId: input.threadId,
    },
  };
}
