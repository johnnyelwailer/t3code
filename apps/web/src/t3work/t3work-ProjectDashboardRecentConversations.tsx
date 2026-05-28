import { useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "~/t3work/components/ui/t3work-input";
import { formatRelativeTime } from "~/t3work/t3work-AppTicketHelpers";
import { runT3workViewTransition } from "~/t3work/t3work-runViewTransition";
import type { ProjectThread } from "~/t3work/t3work-types";

function formatRecentConversationMetadata(thread: { messageCount: number; lastMessageAt: string }) {
  const relativeTime = formatRelativeTime(thread.lastMessageAt);

  if (thread.messageCount <= 0) {
    return relativeTime;
  }

  return `${thread.messageCount} ${thread.messageCount === 1 ? "message" : "messages"} • ${relativeTime}`;
}

type T3workRecentConversationsProps = {
  threads: ProjectThread[];
  onOpenThread: (threadId: string) => void;
  title?: string;
  emptyMessage?: string;
  searchPlaceholder?: string;
  showSearch?: boolean;
  showCount?: boolean;
};

export function T3workRecentConversations({
  threads,
  onOpenThread,
  title = "Recent conversations",
  emptyMessage = "No matching conversations.",
  searchPlaceholder = "Search conversations",
  showSearch = true,
  showCount = true,
}: T3workRecentConversationsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const recentThreads = useMemo(
    () =>
      threads.toSorted(
        (left, right) =>
          new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
      ),
    [threads],
  );
  const normalizedQuery = showSearch ? searchQuery.trim().toLowerCase() : "";
  const filteredThreads = useMemo(() => {
    if (!normalizedQuery) {
      return recentThreads;
    }

    return recentThreads.filter((thread) => {
      const title = thread.title.toLowerCase();
      const ticketId = (thread.ticketId ?? "").toLowerCase();
      return title.includes(normalizedQuery) || ticketId.includes(normalizedQuery);
    });
  }, [normalizedQuery, recentThreads]);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
          {title}
        </h4>
        {showCount ? (
          <span className="text-xs text-muted-foreground/70">{filteredThreads.length}</span>
        ) : null}
      </div>

      {showSearch ? (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 pl-8"
          />
        </div>
      ) : null}

      {filteredThreads.length === 0 ? (
        <p className="px-1 py-1 text-xs text-muted-foreground/70">{emptyMessage}</p>
      ) : (
        <ul className="overflow-hidden rounded-md border border-border/60 bg-background/40">
          {filteredThreads.map((thread) => (
            <li key={thread.id} className="border-b border-border/50 last:border-b-0">
              <button
                type="button"
                className="group flex w-full min-w-0 items-start px-3 py-2.5 text-left transition-colors hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                onClick={() => runT3workViewTransition(() => onOpenThread(thread.id))}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{thread.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground/80">
                    {formatRecentConversationMetadata(thread)}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export const ProjectDashboardRecentConversations = T3workRecentConversations;
