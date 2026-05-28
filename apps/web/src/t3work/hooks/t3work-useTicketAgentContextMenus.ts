import { useCallback } from "react";
import type { MouseEvent } from "react";

import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectTicket } from "~/t3work/t3work-types";

type TicketAgentContextOptions = { visibleInSidebar?: boolean };
type GitHubActivityContextOptions = {
  fallbackHost?: string;
  visibleInSidebar?: boolean;
};

export function useTicketAgentContextMenus<TTicketCapabilities, TGitHubCapabilities>(input: {
  getTicketAgentContext: (
    ticket: ProjectTicket,
    options?: TicketAgentContextOptions,
  ) => TTicketCapabilities | null;
  getGitHubActivityAgentContext: (
    ticket: ProjectTicket | null,
    item: GitHubWorkActivityItem,
    options?: GitHubActivityContextOptions,
  ) => TGitHubCapabilities | null;
  showAgentContextMenu: (
    event: MouseEvent,
    capabilities: TTicketCapabilities | TGitHubCapabilities,
  ) => unknown;
  showAgentContextMenuAt: (input: {
    capabilities: TTicketCapabilities;
    x: number;
    y: number;
  }) => unknown;
}) {
  const openTicketAgentContextMenu = useCallback(
    (event: MouseEvent, ticket: ProjectTicket, options?: TicketAgentContextOptions) => {
      const capabilities = input.getTicketAgentContext(ticket, options);
      if (!capabilities) {
        return;
      }

      void input.showAgentContextMenu(event, capabilities);
    },
    [input],
  );

  const openTicketAgentContextMenuAt = useCallback(
    (ticket: ProjectTicket, x: number, y: number, options?: TicketAgentContextOptions) => {
      const capabilities = input.getTicketAgentContext(ticket, options);
      if (!capabilities) {
        return;
      }

      void input.showAgentContextMenuAt({ capabilities, x, y });
    },
    [input],
  );

  const openGitHubActivityAgentContextMenu = useCallback(
    (
      event: MouseEvent,
      ticket: ProjectTicket | null,
      item: GitHubWorkActivityItem,
      options?: GitHubActivityContextOptions,
    ) => {
      const capabilities = input.getGitHubActivityAgentContext(ticket, item, options);
      if (!capabilities) {
        return;
      }

      void input.showAgentContextMenu(event, capabilities);
    },
    [input],
  );

  return {
    openTicketAgentContextMenu,
    openTicketAgentContextMenuAt,
    openGitHubActivityAgentContextMenu,
  };
}
