import { DotFillIcon, LinkExternalIcon } from "@primer/octicons-react";
import { useState } from "react";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import {
  formatPullRequestState,
  getGitHubActivityVisual,
  isRedundantPullRequestReason,
  pullRequestStateClass,
  renderRelativeUpdatedAt,
  reviewRequestedClass,
} from "~/t3work/t3work-githubActivityViewUtils";

export function GitHubActivityInlineList({
  items,
  limit = 3,
  compact,
}: {
  items: ReadonlyArray<GitHubWorkActivityItem>;
  limit?: number;
  compact?: boolean;
}) {
  if (items.length === 0) return null;
  const [expanded, setExpanded] = useState(false);
  const visibleItems = items.slice(0, expanded ? items.length : limit);
  const remainingCount = Math.max(0, items.length - visibleItems.length);
  return (
    <div
      className={
        compact
          ? "mt-1 ml-1 rounded bg-muted/20 px-1.5 py-1"
          : "mt-2 ml-2 rounded border border-border/70 bg-muted/20 px-2 py-1.5"
      }
    >
      <div className={compact ? "space-y-1" : "space-y-1 border-l border-border/70 pl-2"}>
        {visibleItems.map((item) => {
          const visual = getGitHubActivityVisual(item);
          const updatedAt = renderRelativeUpdatedAt(item.updatedAt);
          const linkTarget = item.subjectUrl ?? item.repositoryUrl;
          const stateLabel = formatPullRequestState(item.subjectState);
          const stateClass = pullRequestStateClass(item.subjectState);
          const reviewRequested = reviewRequestedClass(item);
          const rowContent = (
            <>
              <visual.Icon className={`mt-0.5 size-3 shrink-0 ${visual.iconClassName}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-foreground/90">
                  {item.subjectTitle ?? item.repository}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/80">
                  <span className="truncate">{item.repository}</span>
                  {!isRedundantPullRequestReason(item) ? (
                    <span>{item.reason.replaceAll("_", " ")}</span>
                  ) : null}
                  {item.authorLogin ? (
                    <span className="truncate">by @{item.authorLogin}</span>
                  ) : null}
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
                <LinkExternalIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground/70" />
              ) : null}
            </>
          );

          return (
            <div key={item.id} className="text-[11px]">
              {linkTarget ? (
                <a
                  href={linkTarget}
                  target="_blank"
                  rel="noreferrer"
                  className="relative z-10 flex cursor-pointer items-start gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-accent/35"
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  {rowContent}
                </a>
              ) : (
                <div className="flex items-start gap-1.5 rounded px-1 py-0.5">{rowContent}</div>
              )}
            </div>
          );
        })}
        {remainingCount > 0 ? (
          <button
            type="button"
            className="cursor-pointer text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(true);
            }}
          >
            +{remainingCount} more GitHub items
          </button>
        ) : expanded && items.length > limit ? (
          <button
            type="button"
            className="cursor-pointer text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(false);
            }}
          >
            Show fewer GitHub items
          </button>
        ) : null}
      </div>
    </div>
  );
}
