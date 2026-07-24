export function ProjectDashboardItemTypeToggles({
  showJiraItems,
  onShowJiraItemsChange,
  showGitHubActivity,
  onShowGitHubActivityChange,
}: {
  showJiraItems: boolean;
  onShowJiraItemsChange: (value: boolean) => void;
  showGitHubActivity: boolean;
  onShowGitHubActivityChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Item types
      </div>
      <div className="inline-flex flex-wrap rounded-md border border-border/80 bg-background p-0.5">
        <button
          type="button"
          className={`rounded px-2.5 py-1 text-xs transition-colors ${
            showJiraItems
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
          onClick={() => onShowJiraItemsChange(!showJiraItems)}
        >
          Jira items
        </button>
        <button
          type="button"
          className={`rounded px-2.5 py-1 text-xs transition-colors ${
            showGitHubActivity
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
          onClick={() => onShowGitHubActivityChange(!showGitHubActivity)}
        >
          GitHub activity
        </button>
      </div>
    </div>
  );
}
