/** Side chats kept mounted at once; switching back to one of them shows it without a remount. */
export const KEPT_SIDE_CHAT_LIMIT = 3;

/** The most recently shown side chats still open, newest first. */
export function keptSideChatIds(
  previous: ReadonlyArray<string>,
  activeId: string | null,
  openIds: ReadonlySet<string>,
): ReadonlyArray<string> {
  const stillOpen = previous.filter((id) => openIds.has(id) && id !== activeId);
  const next = activeId === null ? stillOpen : [activeId, ...stillOpen];
  return next.slice(0, KEPT_SIDE_CHAT_LIMIT);
}
