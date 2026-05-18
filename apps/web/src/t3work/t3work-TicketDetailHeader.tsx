import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "~/t3work/components/ui/t3work-button";
import { SidebarTrigger } from "~/t3work/components/ui/t3work-sidebar";
import { JiraIssueTypeIcon } from "~/t3work/components/ticket/t3work-JiraIssueType";

export function TicketDetailHeader({
  displayId,
  status,
  title,
  issueType,
  issueTypeIconUrl,
  onBack,
  onReload,
  ticketUrl,
}: {
  displayId: string;
  status: string;
  title: string;
  issueType: string | undefined;
  issueTypeIconUrl: string | undefined;
  onBack: () => void;
  onReload: () => void;
  ticketUrl: string | undefined;
}) {
  return (
    <header className="flex h-13 shrink-0 items-center gap-2 border-b border-border bg-gradient-to-b from-background to-muted/12 px-3 sm:px-5">
      <SidebarTrigger className="size-7 shrink-0 md:hidden" />
      <Button size="icon-xs" variant="ghost" onClick={onBack} aria-label="Back to dashboard">
        <ArrowLeft className="size-4" />
      </Button>
      <JiraIssueTypeIcon issueType={issueType} issueTypeIconUrl={issueTypeIconUrl} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-1 min-w-0">
          <h2 className="truncate text-sm font-medium min-w-0">{displayId}</h2>
          <span className="ml-1 text-[10px] text-muted-foreground/75">{status}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground/80 mt-0.5">{title}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="xs" variant="outline" onClick={onReload}>
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
        {ticketUrl ? (
          <a href={ticketUrl} target="_blank" rel="noreferrer">
            <Button size="xs" variant="outline">
              <ExternalLink className="size-3.5" />
              Open Jira
            </Button>
          </a>
        ) : null}
      </div>
    </header>
  );
}
