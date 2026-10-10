import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import { renderRelativeUpdatedAt } from "~/t3team/t3team-githubActivityViewUtils";
import { ProjectMyWorkPrChips } from "~/t3team/t3team-ProjectMyWorkPrChips";
import type { ProjectTicket } from "~/t3team/t3team-types";

const NO_PULL_REQUESTS: ReadonlyArray<GitHubWorkActivityItem> = [];

export function ProjectMyWorkTicketExtra({
  ticket,
  compact = false,
  pullRequests = NO_PULL_REQUESTS,
}: {
  ticket: ProjectTicket;
  compact?: boolean;
  pullRequests?: ReadonlyArray<GitHubWorkActivityItem>;
}) {
  // Related open PRs show on every lens, compact cards and nested hierarchy rows included; only the
  // "Updated …" line is dropped where space is tight.
  const updatedLabel = compact ? null : renderRelativeUpdatedAt(ticket.updatedAt);

  return (
    <>
      <ProjectMyWorkPrChips items={pullRequests} />
      {updatedLabel ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-3xs text-muted-foreground">Updated {updatedLabel}</span>
        </div>
      ) : null}
    </>
  );
}
