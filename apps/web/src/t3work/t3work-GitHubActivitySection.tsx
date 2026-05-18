import { DotFillIcon, LinkExternalIcon } from "@primer/octicons-react";
import { ExternalLink } from "lucide-react";
import { Skeleton } from "~/t3work/components/ui/t3work-skeleton";
import { T3SurfacePanel } from "~/t3work/components/ui/t3work-surface";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import {
  formatPullRequestState,
  getGitHubActivityVisual,
  isRedundantPullRequestReason,
  pullRequestStateClass,
  renderRelativeUpdatedAt,
  reviewRequestedClass,
} from "~/t3work/t3work-githubActivityViewUtils";

export function GitHubActivitySection({
  title,
  items,
  warning,
  suggestedRepositoryCount,
  host,
  account,
  loading,
}: {
  title: string;
  items: ReadonlyArray<GitHubWorkActivityItem>;
  warning?: string;
  suggestedRepositoryCount?: number;
  host?: string;
  account?: string;
  loading?: boolean;
}) {
  return (
    <T3SurfacePanel tone="muted" className="p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <div className="text-[11px] text-muted-foreground">
          {host ? <span>{host}</span> : null}
          {account ? <span> · {account}</span> : null}
        </div>
      </div>
      {warning ? (
        <div className="mb-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
          {warning}
        </div>
      ) : null}
      {loading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-4/5" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded border border-dashed border-border/70 bg-background/60 px-3 py-4 text-xs text-muted-foreground">
          No GitHub activity matched yet.
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => {
            const visual = getGitHubActivityVisual(item);
            const updatedAt = renderRelativeUpdatedAt(item.updatedAt);
            const linkTarget = item.subjectUrl ?? item.repositoryUrl;
            const stateLabel = formatPullRequestState(item.subjectState);
            const stateClass = pullRequestStateClass(item.subjectState);
            const reviewRequested = reviewRequestedClass(item);
            const rowContent = (
              <>
                <visual.Icon className={`mt-0.5 size-3.5 shrink-0 ${visual.iconClassName}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground/90">
                    {item.subjectTitle ?? item.repository}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>{item.repository}</span>
                    {!isRedundantPullRequestReason(item) ? (
                      <span>{item.reason.replaceAll("_", " ")}</span>
                    ) : null}
                    {item.authorLogin ? <span>by @{item.authorLogin}</span> : null}
                    {reviewRequested ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-1 py-0.5 text-[10px] ${reviewRequested}`}
                      >
                        <DotFillIcon className="size-2" />
                        Review requested
                      </span>
                    ) : null}
                    {item.subjectBranch ? (
                      <span className="truncate" title={item.subjectBranch}>
                        {item.subjectBranch}
                      </span>
                    ) : null}
                    {stateLabel && stateClass ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-1 py-0.5 text-[10px] ${stateClass}`}
                      >
                        <DotFillIcon className="size-2" />
                        {stateLabel}
                      </span>
                    ) : null}
                    {updatedAt ? <span>{updatedAt}</span> : null}
                  </div>
                </div>
                {linkTarget ? (
                  <LinkExternalIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
                ) : null}
              </>
            );
            return (
              <div key={item.id} className="rounded border border-border/70 bg-background/70">
                {linkTarget ? (
                  <a
                    href={linkTarget}
                    target="_blank"
                    rel="noreferrer"
                    className="relative z-10 flex cursor-pointer items-start gap-2 px-2 py-1.5 transition-colors hover:bg-accent/35"
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    {rowContent}
                  </a>
                ) : (
                  <div className="flex items-start gap-2 px-2 py-1.5">{rowContent}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {suggestedRepositoryCount && suggestedRepositoryCount > 0 ? (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          <ExternalLink className="size-3" />
          {suggestedRepositoryCount} suggested repositories available
        </div>
      ) : null}
    </T3SurfacePanel>
  );
}
