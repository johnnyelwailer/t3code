import type { ReactNode } from "react";

import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { ScrollArea } from "~/t3team/components/ui/t3team-scroll-area";
import { BacklogBoardScopeNotice } from "~/t3team/t3team-BacklogBoardScopeNotice";
import { t3teamScopeContentWidthClass } from "~/t3team/t3team-scopeContentWidth";

/**
 * Presentational shell for the dashboard backlog view, split from
 * t3team-ProjectDashboardBacklogView.tsx (controller) to keep that file under
 * the additive-guard LOC cap: scrollable page layout for regular view modes,
 * fixed full-height layout for immersive ones.
 */
export function ProjectDashboardBacklogViewLayout({
  overview,
  onReconnectBoard,
  content,
  error,
  isImmersiveView,
}: {
  overview: ReactNode;
  /** Set while the Jira grant lacks board scopes: shows the reconnect prompt, then reloads. */
  onReconnectBoard?: () => Promise<void>;
  content: ReactNode;
  error: string | null;
  isImmersiveView: boolean;
}) {
  const notice = onReconnectBoard ? (
    <BacklogBoardScopeNotice onReconnected={() => void onReconnectBoard()} />
  ) : null;
  if (!isImmersiveView) {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div
          className={`mx-auto flex w-full ${t3teamScopeContentWidthClass} flex-col space-y-2 p-4 sm:p-6`}
        >
          {overview}
          {notice}
          {error ? <T3TeamErrorState error={error} variant="inline" /> : null}
          {content}
        </div>
      </ScrollArea>
    );
  }

  return (
    <div
      className={`mx-auto flex min-h-0 w-full ${t3teamScopeContentWidthClass} flex-1 flex-col overflow-hidden`}
    >
      <div className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-6">{overview}</div>
      {notice ? <div className="shrink-0 px-4 pt-2 sm:px-6">{notice}</div> : null}
      {error ? (
        <div className="shrink-0 px-4 sm:px-6">
          <T3TeamErrorState error={error} variant="inline" />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{content}</div>
    </div>
  );
}
