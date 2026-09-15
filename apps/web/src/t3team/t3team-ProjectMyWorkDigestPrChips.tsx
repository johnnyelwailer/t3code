import { Badge } from "~/t3team/components/ui/t3team-badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import { digestPrUrl, digestReviewerUrl } from "~/t3team/t3team-projectMyWorkDigestFacts";
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
export function DigestReviewerStack({ reviewers }: { reviewers: readonly DigestReviewer[] }) {
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
                href={digestReviewerUrl(reviewer)}
                className="inline-flex opacity-80 hover:opacity-100"
                aria-label={`Reviewed by ${reviewer.name}`}
              >
                <WorkItemPersonAvatar person={{ displayName: reviewer.name }} size="sm" />
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
        <span className="-translate-y-px text-[10px] leading-none text-muted-foreground">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

/**
 * One PR: repo#number (linked), its live state, who is reviewing it, and pending comments — as a
 * contained pill, matching the other-children subtask chips so both read as "compact ticket
 * references". A ticket's PRs render as a wrapped row of these, newest first as the graph orders
 * them.
 */
export function DigestPrChip({ pr }: { pr: DigestChangeRequest }) {
  const state = PR_STATE[pr.state];
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-background/70 px-1.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border/50 hover:ring-border">
      <a
        href={digestPrUrl(pr)}
        className="-translate-y-px font-mono text-[10.5px] leading-none text-muted-foreground hover:text-foreground hover:underline"
      >
        {pr.repo}#{pr.number}
      </a>
      <Badge size="sm" variant={state.variant} className="text-[10px] leading-none">
        {state.label}
      </Badge>
      <DigestReviewerStack reviewers={pr.reviewers} />
      {pr.unhandledComments && pr.unhandledComments > 0 ? (
        <span className="-translate-y-px text-[10px] leading-none text-muted-foreground">
          {pr.unhandledComments} comments
        </span>
      ) : null}
    </span>
  );
}

export function DigestPrChips({ prs }: { prs: readonly DigestChangeRequest[] }) {
  if (prs.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {prs.map((pr) => (
        <DigestPrChip key={pr.id} pr={pr} />
      ))}
    </div>
  );
}
