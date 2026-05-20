import { GitHubActivitySection } from "~/t3work/t3work-GitHubActivitySection";
import type { MouseEvent } from "react";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { AddToChatRequest } from "~/t3work/t3work-addToChatUtils";
import type { ProjectTicket } from "~/t3work/t3work-types";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import { createGitHubActivityAddToChatRequest } from "~/t3work/t3work-githubActivityAttachmentRequest";

export function TicketDetailGitHubSection({
  backend,
  project,
  ticket,
  projectTickets,
  displayId: _displayId,
  githubActivityItems,
  showAddToChatContextMenu,
  githubActivityLoading,
  githubActivityWarning,
  githubHost,
  githubAccount,
  githubActivityLastCheckedAt,
}: {
  backend?: BackendApi;
  project: ProjectShellProject;
  ticket?: ProjectTicket;
  projectTickets: ReadonlyArray<ProjectTicket>;
  displayId: string;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  showAddToChatContextMenu: (event: MouseEvent, request: AddToChatRequest) => Promise<void>;
  githubActivityLoading?: boolean;
  githubActivityWarning?: string;
  githubHost?: string;
  githubAccount?: string;
  githubActivityLastCheckedAt?: number;
}) {
  return (
    <GitHubActivitySection
      title="Related GitHub activity"
      items={githubActivityItems}
      {...(githubActivityLastCheckedAt !== undefined
        ? { lastCheckedAt: githubActivityLastCheckedAt }
        : {})}
      onItemContextMenu={(event, item) => {
        void showAddToChatContextMenu(
          event,
          createGitHubActivityAddToChatRequest({
            backend,
            project,
            item,
            linkedWorkItem: ticket ?? null,
            projectTickets,
            githubActivityItems,
            ...(githubHost ? { fallbackHost: githubHost } : {}),
          }),
        );
      }}
      {...(githubActivityLoading ? { loading: githubActivityLoading } : {})}
      {...(githubActivityWarning ? { warning: githubActivityWarning } : {})}
      {...(githubHost ? { host: githubHost } : {})}
      {...(githubAccount ? { account: githubAccount } : {})}
    />
  );
}
