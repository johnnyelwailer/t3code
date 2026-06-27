/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import { useMemo } from "react";

import { GitHubActivitySection } from "~/t3work/t3work-GitHubActivitySection";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { ProjectTicket } from "~/t3work/t3work-types";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import { useTicketAgentContext } from "~/t3work/hooks/t3work-useTicketAgentContext";

export function TicketDetailGitHubSection({
  backend,
  project,
  ticket,
  projectTickets,
  displayId: _displayId,
  githubActivityItems,
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
  githubActivityLoading?: boolean;
  githubActivityWarning?: string;
  githubHost?: string;
  githubAccount?: string;
  githubActivityLastCheckedAt?: number;
}) {
  const githubActivityByWorkItem = useMemo(
    () =>
      ticket
        ? new Map<string, readonly GitHubWorkActivityItem[]>([
            [ticket.ref.displayId, githubActivityItems],
          ])
        : undefined,
    [githubActivityItems, ticket],
  );
  const { getGitHubActivityAgentContext, openGitHubActivityAgentContextMenu } =
    useTicketAgentContext({
      project,
      projectTickets,
      ...(githubActivityByWorkItem ? { githubActivityByWorkItem } : {}),
    });

  return (
    <GitHubActivitySection
      title="Related GitHub activity"
      items={githubActivityItems}
      {...(githubActivityLastCheckedAt !== undefined
        ? { lastCheckedAt: githubActivityLastCheckedAt }
        : {})}
      onItemContextMenu={(event, item) => {
        openGitHubActivityAgentContextMenu(
          event,
          ticket ?? null,
          item,
          githubHost ? { fallbackHost: githubHost } : {},
        );
      }}
      getItemDragCapabilities={(item) =>
        getGitHubActivityAgentContext(
          ticket ?? null,
          item,
          githubHost ? { fallbackHost: githubHost } : {},
        )
      }
      {...(githubActivityLoading ? { loading: githubActivityLoading } : {})}
      {...(githubActivityWarning ? { warning: githubActivityWarning } : {})}
      {...(githubHost ? { host: githubHost } : {})}
      {...(githubAccount ? { account: githubAccount } : {})}
    />
  );
}
