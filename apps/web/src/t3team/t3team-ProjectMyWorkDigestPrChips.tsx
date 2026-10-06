import { ProjectId } from "@t3tools/contracts";
import { useState, type MouseEvent } from "react";

import { Badge } from "~/t3team/components/ui/t3team-badge";
import { openDigestPullRequest } from "~/t3team/t3team-digestPrAsideStore";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import {
  digestPrUrl,
  digestReviewerUrl,
  digestTitleWithoutKey,
} from "~/t3team/t3team-projectMyWorkDigestFacts";
import type { DigestChangeRequest, DigestReviewer } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { WorkItemPersonAvatar } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";

/**
 * PR lifecycle states as the digest reads them. Tones follow the app's PR surface: a verdict the
 * viewer owes is amber, a negative verdict or broken CI is red, earned states are green, neutral
 * states stay quiet.
 */
const PR_STATE: Record<
  DigestChangeRequest["state"],
  {
    readonly label: string;
    readonly variant: "error" | "warning" | "success" | "secondary" | "outline";
  }
> = {
  draft: { label: "draft", variant: "secondary" },
  open: { label: "open", variant: "secondary" },
  "needs-you": { label: "your review", variant: "warning" },
  "changes-requested": { label: "changes requested", variant: "error" },
  "ci-failing": { label: "ci failing", variant: "error" },
  approved: { label: "approved", variant: "success" },
  merged: { label: "merged", variant: "outline" },
};

/**
 * Reviewer avatars only — the name lives in the tooltip, so the chip row carries no text that
 * repeats what the avatar's initials already say. Two at most, then a count. Each links to the
 * GitHub handle.
 */
export function DigestReviewerStack({
  reviewers,
  host,
}: {
  reviewers: readonly DigestReviewer[];
  host?: string | undefined;
}) {
  if (reviewers.length === 0) return null;
  const shown = reviewers.slice(0, 2);
  const rest = reviewers.length - shown.length;
  return (
    <span className="flex items-center gap-1">
      {shown.map((reviewer) => (
        <Tooltip key={reviewer.login}>
          <TooltipTrigger
            render={
              <a
                href={digestReviewerUrl(reviewer, host)}
                className="inline-flex opacity-80 hover:opacity-100"
                aria-label={`Reviewed by ${reviewer.name}`}
              >
                <WorkItemPersonAvatar
                  person={{
                    displayName: reviewer.name,
                    ...(reviewer.avatarUrl ? { avatarUrl: reviewer.avatarUrl } : {}),
                  }}
                  size="sm"
                />
              </a>
            }
          />
          <TooltipPopup side="top">
            {reviewer.name}
            {reviewer.decision
              ? ` · ${reviewer.decision === "approved" ? "approved" : "requested changes"}`
              : " · reviewing"}
          </TooltipPopup>
        </Tooltip>
      ))}
      {rest > 0 ? (
        <span className="-translate-y-px text-3xs leading-none text-muted-foreground">+{rest}</span>
      ) : null}
    </span>
  );
}

/**
 * One PR as a compact pill: short repo name and number, the title as far as it fits, its state.
 * Hovering shows the whole of it; a click opens it in the dashboard's aside (the app's own PR
 * detail), a middle-click still goes to the host.
 */
export function DigestPrChip({
  pr,
  repoLabel = (repo) => repo,
}: {
  pr: DigestChangeRequest;
  repoLabel?: (repo: string) => string;
}) {
  const state = PR_STATE[pr.state];
  const open = (event: MouseEvent) => {
    event.stopPropagation();
    if (pr.projectId === undefined || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    openDigestPullRequest({
      projectId: ProjectId.make(pr.projectId),
      ...(pr.host !== undefined ? { host: pr.host } : {}),
      repository: pr.repo,
      number: pr.number,
    });
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={digestPrUrl(pr)}
            onClick={open}
            className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md bg-background/70 px-1.5 py-0.5 text-2xs text-muted-foreground ring-1 ring-border/50 hover:text-foreground hover:ring-border"
          >
            <span className="shrink-0 -translate-y-px font-mono text-3xs leading-none">
              {repoLabel(pr.repo)}#{pr.number}
            </span>
            {pr.title ? (
              <span className="min-w-0 max-w-64 -translate-y-px truncate leading-none text-foreground/80">
                {digestTitleWithoutKey(pr.title, pr.ticketId)}
              </span>
            ) : null}
            <Badge size="sm" variant={state.variant}>
              {state.label}
            </Badge>
            <DigestReviewerStack reviewers={pr.reviewers} host={pr.host} />
            {pr.unhandledComments && pr.unhandledComments > 0 ? (
              <span className="-translate-y-px text-3xs leading-none">
                {pr.unhandledComments} comments
              </span>
            ) : null}
          </a>
        }
      />
      <TooltipPopup side="top" className="max-w-sm">
        <p className="font-medium">{pr.title ?? `${pr.repo}#${pr.number}`}</p>
        <p className="text-muted-foreground">
          {pr.repo}#{pr.number} · {state.label} · updated {pr.updatedAt.slice(0, 10)}
        </p>
      </TooltipPopup>
    </Tooltip>
  );
}

const SHOWN_PRS = 3;

/** A ticket's PRs, live ones first and drafts last; past three, the rest fold behind "+N". */
export function DigestPrChips({
  prs,
  repoLabel,
}: {
  prs: readonly DigestChangeRequest[];
  repoLabel?: (repo: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (prs.length === 0) return null;
  const ordered = prs.toSorted((a, b) => Number(a.state === "draft") - Number(b.state === "draft"));
  const shown = expanded ? ordered : ordered.slice(0, SHOWN_PRS);
  const hidden = ordered.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {shown.map((pr) => (
        <DigestPrChip key={pr.id} pr={pr} {...(repoLabel ? { repoLabel } : {})} />
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          className="text-3xs text-muted-foreground hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded(true);
          }}
        >
          +{hidden} more
        </button>
      ) : null}
    </div>
  );
}
