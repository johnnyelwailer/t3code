import { GitHubActivitySection } from "~/t3work/t3work-GitHubActivitySection";
import type { MouseEvent } from "react";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectShellProject } from "@t3tools/project-context";
import { buildComprehensiveTicketPayload } from "~/t3work/t3work-addToChatPayloadBuilders";
import {
  buildGitHubActivityContextBundle,
  buildGitHubActivityDisplay,
} from "~/t3work/t3work-githubActivityContextPayload";
import type { ProjectTicket } from "~/t3work/t3work-types";
import type { BackendApi } from "~/t3work/backend/t3work-types";

export function TicketDetailGitHubSection({
  projectId,
  projectTitle,
  projectWorkspaceRoot,
  backend,
  project,
  ticket,
  projectTickets,
  displayId,
  githubActivityItems,
  showAddToChatContextMenu,
  githubActivityLoading,
  githubActivityWarning,
  githubHost,
  githubAccount,
}: {
  projectId: string;
  projectTitle: string;
  projectWorkspaceRoot?: string;
  backend?: BackendApi;
  project: ProjectShellProject;
  ticket?: ProjectTicket;
  projectTickets: ReadonlyArray<ProjectTicket>;
  displayId: string;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  showAddToChatContextMenu: (
    event: MouseEvent,
    request: {
      projectId: string;
      projectTitle: string;
      projectWorkspaceRoot?: string;
      targetLabel: string;
      targetType: string;
      dedupeKey?: string;
      payload: unknown | (() => Promise<unknown>);
      summaryItems?: ReadonlyArray<{ label: string; value: string }>;
    },
  ) => Promise<void>;
  githubActivityLoading?: boolean;
  githubActivityWarning?: string;
  githubHost?: string;
  githubAccount?: string;
}) {
  return (
    <GitHubActivitySection
      title="Related GitHub activity"
      items={githubActivityItems}
      onItemContextMenu={(event, item) => {
        const display = buildGitHubActivityDisplay({ item });
        void showAddToChatContextMenu(event, {
          projectId,
          projectTitle,
          ...(projectWorkspaceRoot ? { projectWorkspaceRoot } : {}),
          targetLabel: display.targetLabel,
          targetType: display.targetType,
          dedupeKey: `${projectId}:github-activity:${item.id}`,
          summaryItems: display.summaryItems,
          payload: async () => {
            const linkedTicketContext =
              backend && ticket
                ? await buildComprehensiveTicketPayload({
                    backend,
                    project,
                    ticket,
                    projectTickets,
                    githubActivityItems,
                  })
                : undefined;
            return buildGitHubActivityContextBundle({
              project,
              item,
              linkedWorkItem: ticket ?? null,
              ...(linkedTicketContext ? { linkedTicketContext } : {}),
            });
          },
        });
      }}
      {...(githubActivityLoading ? { loading: githubActivityLoading } : {})}
      {...(githubActivityWarning ? { warning: githubActivityWarning } : {})}
      {...(githubHost ? { host: githubHost } : {})}
      {...(githubAccount ? { account: githubAccount } : {})}
    />
  );
}
