import { useEffect, useRef } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { takeEmbeddedTicketThreadAutoAttach } from "~/t3team/t3team-embeddedTicketThreadAutoAttach";
import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import type { ProjectThread, ProjectTicket } from "~/t3team/t3team-types";

export function useTicketDetailEmbeddedThreadEffects({
  activeThread,
  addToChatFromRequest,
  backend,
  githubActivityItems,
  onRememberEmbeddedThread,
  project,
  projectTickets,
  ticket,
}: {
  activeThread: ProjectThread | null;
  addToChatFromRequest: (
    request: AddToChatRequest,
    target: { type: "thread"; threadId: string },
  ) => Promise<void> | void;
  backend: BackendApi | null;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  onRememberEmbeddedThread: (threadId: string) => void;
  project: ProjectShellProject;
  projectTickets: ReadonlyArray<ProjectTicket>;
  ticket: ProjectTicket | undefined;
}) {
  const embeddedThreadAutoAttachKeysRef = useRef(new Set<string>());

  useEffect(() => {
    if (!activeThread) {
      return;
    }

    onRememberEmbeddedThread(activeThread.id);
  }, [activeThread, onRememberEmbeddedThread]);

  useEffect(() => {
    if (!backend || !ticket || !activeThread) {
      return;
    }

    const autoAttach = takeEmbeddedTicketThreadAutoAttach({
      seenKeys: embeddedThreadAutoAttachKeysRef.current,
      threadId: activeThread.id,
      backend,
      project,
      ticket,
      projectTickets,
      githubActivityItems,
    });
    if (!autoAttach) {
      return;
    }

    void addToChatFromRequest(autoAttach.request, autoAttach.target);
  }, [
    activeThread,
    addToChatFromRequest,
    backend,
    githubActivityItems,
    project,
    projectTickets,
    ticket,
  ]);
}
