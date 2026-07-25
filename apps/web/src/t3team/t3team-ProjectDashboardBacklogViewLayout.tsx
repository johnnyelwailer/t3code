import type { ReactNode } from "react";

import { ScrollArea } from "~/t3team/components/ui/t3team-scroll-area";

/**
 * Presentational shell for the dashboard backlog view, split from
 * t3team-ProjectDashboardBacklogView.tsx (controller) to keep that file under
 * the additive-guard LOC cap: scrollable page layout for regular view modes,
 * fixed full-height layout for immersive ones.
 */
export function ProjectDashboardBacklogViewLayout({
  overview,
  content,
  error,
  isImmersiveView,
}: {
  overview: ReactNode;
  content: ReactNode;
  error: string | null;
  isImmersiveView: boolean;
}) {
  if (!isImmersiveView) {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-6xl flex-col space-y-2 p-4 sm:p-6">
          {overview}
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
          {content}
        </div>
      </ScrollArea>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-6">{overview}</div>
      {error ? <div className="shrink-0 px-4 text-sm text-destructive sm:px-6">{error}</div> : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{content}</div>
    </div>
  );
}
