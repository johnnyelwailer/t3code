import {
  CommentDiscussionIcon,
  DiffAddedIcon,
  DiffRemovedIcon,
  FileDiffIcon,
} from "@primer/octicons-react";
import type { ComponentType } from "react";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import {
  formatPullRequestState,
  isActiveReviewRequested,
  isRedundantPullRequestReason,
} from "~/t3work/t3work-githubActivityViewUtils";

function formatReason(reason: string): string {
  return reason.replaceAll("_", " ");
}

function formatAbsoluteTime(updatedAt: string | undefined): string | undefined {
  if (!updatedAt) return undefined;
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return updatedAt;
  return new Date(timestamp).toLocaleString();
}

function parsePullRequestNumber(subjectUrl: string | undefined): string | undefined {
  if (!subjectUrl) return undefined;
  const match = subjectUrl.match(/\/pull\/(\d+)(?:[/?#].*)?$/i);
  return match ? match[1] : undefined;
}

function parseOwnerAndRepo(repository: string): { owner: string; repo: string } | { repo: string } {
  const [owner, repo] = repository.split("/");
  if (!repo) {
    return { repo: repository };
  }
  return { owner, repo };
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[4.25rem_1fr] gap-2">
      <span className="text-muted-foreground/80">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: string;
  tone: "neutral" | "positive" | "negative";
  Icon?: ComponentType<{ className?: string }>;
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "negative"
        ? "text-rose-700 dark:text-rose-400"
        : "text-foreground/80";
  return (
    <div className={`inline-flex items-center gap-1.5 ${toneClass}`}>
      {Icon ? <Icon className="size-3" /> : null}
      <span className="text-[10px] font-semibold tabular-nums">{value}</span>
      <span className="text-[10px] text-muted-foreground/80">{label}</span>
    </div>
  );
}

function AuthorAvatar({
  login,
  avatarUrl,
}: {
  login: string | undefined;
  avatarUrl: string | undefined;
}) {
  if (!login && !avatarUrl) return null;
  const fallback = (login?.[0] ?? "?").toUpperCase();
  return avatarUrl ? (
    <img
      src={avatarUrl}
      alt={login ? `@${login}` : "GitHub author"}
      className="size-7 rounded-full border border-border/70 object-cover"
    />
  ) : (
    <div className="inline-flex size-7 items-center justify-center rounded-full border border-border/70 bg-muted/40 text-[10px] font-semibold text-foreground/80">
      {fallback}
    </div>
  );
}

export function GitHubActivityTooltipContent({ item }: { item: GitHubWorkActivityItem }) {
  const prNumber = parsePullRequestNumber(item.subjectUrl);
  const state = formatPullRequestState(item.subjectState);
  const reviewRequested = isActiveReviewRequested(item);
  const reason =
    reviewRequested || isRedundantPullRequestReason(item) ? undefined : formatReason(item.reason);
  const absoluteUpdatedAt = formatAbsoluteTime(item.updatedAt);
  const ownerAndRepo = parseOwnerAndRepo(item.repository);
  const owner = "owner" in ownerAndRepo ? ownerAndRepo.owner : undefined;
  const totalCommentCount =
    (typeof item.commentCount === "number" ? item.commentCount : 0) +
    (typeof item.reviewCommentCount === "number" ? item.reviewCommentCount : 0);
  const hasStats =
    typeof item.additions === "number" ||
    typeof item.deletions === "number" ||
    typeof item.changedFiles === "number" ||
    totalCommentCount > 0;
  const summaryBits = [
    reviewRequested
      ? {
          label: "Review requested",
          className: "text-sky-700 dark:text-sky-300",
        }
      : null,
    state
      ? {
          label: state,
          className: "text-foreground/80",
        }
      : null,
    reason
      ? {
          label: reason,
          className: "text-muted-foreground/80",
        }
      : null,
  ].filter((value): value is { label: string; className: string } => value !== null);

  return (
    <div className="w-[22rem] space-y-3 text-[11px] leading-4">
      <div className="space-y-2 border-b border-border/70 pb-2">
        <div className="flex items-start gap-2.5">
          <AuthorAvatar login={item.authorLogin} avatarUrl={item.authorAvatarUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground/80">
              {owner ? <span>{owner}</span> : null}
              <span className="font-medium text-foreground/80">{ownerAndRepo.repo}</span>
              {prNumber ? <span>PR #{prNumber}</span> : null}
            </div>
            <div className="mt-1 line-clamp-3 text-[12px] font-semibold leading-5 text-foreground">
              {item.subjectTitle ?? item.repository}
            </div>
          </div>
        </div>

        {summaryBits.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] font-medium">
            {summaryBits.map((bit) => (
              <span key={bit.label} className={bit.className}>
                {bit.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {hasStats ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {typeof item.changedFiles === "number" ? (
            <StatChip
              label="files"
              value={String(item.changedFiles)}
              tone="neutral"
              Icon={FileDiffIcon}
            />
          ) : null}
          {typeof item.additions === "number" ? (
            <StatChip
              label="added"
              value={`+${item.additions}`}
              tone="positive"
              Icon={DiffAddedIcon}
            />
          ) : null}
          {typeof item.deletions === "number" ? (
            <StatChip
              label="removed"
              value={`-${item.deletions}`}
              tone="negative"
              Icon={DiffRemovedIcon}
            />
          ) : null}
          {totalCommentCount > 0 ? (
            <StatChip
              label="comments"
              value={String(totalCommentCount)}
              tone="neutral"
              Icon={CommentDiscussionIcon}
            />
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1.5">
        {item.authorLogin ? <MetadataRow label="Author" value={`@${item.authorLogin}`} /> : null}
        {item.subjectBranch ? <MetadataRow label="Branch" value={item.subjectBranch} /> : null}
        {absoluteUpdatedAt ? <MetadataRow label="Updated" value={absoluteUpdatedAt} /> : null}
      </div>
    </div>
  );
}
