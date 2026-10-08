import { createContext, useContext } from "react";

import type { TicketKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";

/**
 * The app callbacks a ticket's chat needs, for a ticket shown beside My Work. The digest aside sits
 * several layers below the app shell that owns them; a ticket opened there gets the same chat as
 * the ticket page, but a thread it starts opens beside My Work instead of on the ticket page.
 */
export type DigestTicketChatActions = {
  readonly onKickoffThread: (input: TicketKickoffThreadInput) => void;
  readonly onOpenThread: (projectId: string, threadId: string) => void;
  readonly onOpenFullThread: (projectId: string, threadId: string) => void;
  readonly onThreadKickoffConsumed: (threadId: string) => void;
};

const DigestTicketChatContext = createContext<DigestTicketChatActions | null>(null);

export const DigestTicketChatProvider = DigestTicketChatContext.Provider;

/** Null outside the app shell (stories, tests): the ticket aside then offers no chat tab. */
export function useDigestTicketChatActions(): DigestTicketChatActions | null {
  return useContext(DigestTicketChatContext);
}
