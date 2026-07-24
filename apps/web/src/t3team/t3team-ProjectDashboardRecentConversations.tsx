import { useMemo, useState, type ReactNode } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "~/t3team/components/ui/t3team-input";
import { formatRelativeTime } from "~/t3team/t3team-AppTicketHelpers";
import { runT3TeamViewTransition } from "~/t3team/t3team-runViewTransition";
import type { ProjectThread } from "~/t3team/t3team-types";

function formatRecentConversationMetadata(thread: { messageCount: number; lastMessageAt: string }) {
  const relativeTime = formatRelativeTime(thread.lastMessageAt);

  if (thread.messageCount <= 0) {
    return relativeTime;
  }

  return `${thread.messageCount} ${thread.messageCount === 1 ? "message" : "messages"} • ${relativeTime}`;
}

type T3TeamRecentConversationsProps = {
  threads: ReadonlyArray<ProjectThread>;
  onOpenThread: (threadId: string) => void;
  title?: string;
  emptyMessage?: string;
  searchPlaceholder?: string;
  showHeader?: boolean;
  showSearch?: boolean;
  showCount?: boolean;
  renderThread?: ((thread: ProjectThread, content: ReactNode) => ReactNode) | undefined;
};

export function T3TeamRecentConversations({
  threads,
  onOpenThread,
  title = "Recent conversations",
  emptyMessage = "No matching conversations.",
  searchPlaceholder = "Search conversations",
  showHeader = true,
  showSearch = true,
  showCount = true,
  renderThread,
}: T3TeamRecentConversationsProps) {
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
      {showHeader ? (
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
            {title}
          </h4>
          {showCount ? (
            <span className="text-xs text-muted-foreground/70">{filteredThreads.length}</span>
          ) : null}
        </div>
      ) : null}

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
          {filteredThreads.map((thread) => {
            const content = (
              <button
                type="button"
                className="group flex w-full min-w-0 items-start px-3 py-2.5 text-left transition-colors hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                onClick={() => runT3TeamViewTransition(() => onOpenThread(thread.id))}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{thread.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground/80">
                    {formatRecentConversationMetadata(thread)}
                  </div>
                </div>
              </button>
            );

            return (
              <li key={thread.id} className="border-b border-border/50 last:border-b-0">
                {renderThread ? renderThread(thread, content) : content}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export const ProjectDashboardRecentConversations = T3TeamRecentConversations;
