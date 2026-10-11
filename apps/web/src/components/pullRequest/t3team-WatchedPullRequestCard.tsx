/**
 * The indicator's card (doc 07 §3.3): who watches the pull request, one row per watcher. Also
 * the body of the `RunToggle` count hover, which lists several pull requests at once.
 */
import type { ThreadPullRequestLink } from "@t3tools/contracts";
import { EyeIcon } from "lucide-react";

import type { PullRequestIdentity } from "~/state/t3team-watchedPullRequests";
import type { WatchedPullRequestWatcher } from "~/state/t3team-watchedPullRequests.logic";

import { WatchedPullRequestCardRow } from "./t3team-WatchedPullRequestCardRow";

function stop(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

/**
 * The popup portals out of the DOM, but React still bubbles its events to the row or link the
 * trigger sits in (upstream notes the same on its stop button). Nothing inside a card may
 * activate, rename or open the host row. No preventDefault: the buttons keep working.
 */
export const HOST_ROW_EVENT_GUARD = {
  onClick: stop,
  onPointerDown: stop,
  onDoubleClick: stop,
  onContextMenu: stop,
  onKeyDown: stop,
} as const;

export function shortRepositoryLabel(repository: string): string {
  const slash = repository.lastIndexOf("/");
  return slash === -1 ? repository : repository.slice(slash + 1);
}

export function WatchedPullRequestCard({
  identity,
  watchers,
  link,
}: {
  identity: PullRequestIdentity;
  watchers: ReadonlyArray<WatchedPullRequestWatcher>;
  link: ThreadPullRequestLink;
}) {
  return (
    <div
      className="flex min-w-0 flex-col"
      data-testid="watched-pull-request-card"
      {...HOST_ROW_EVENT_GUARD}
    >
      <div className="flex items-center gap-1.5 px-1 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        <EyeIcon aria-hidden className="size-3" />
        Watching
        <span className="font-mono font-normal normal-case tracking-normal">
          {shortRepositoryLabel(identity.repository)}#{identity.number}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {watchers.map((watcher) => (
          <WatchedPullRequestCardRow
            key={watcher.threadRef.threadId}
            watcher={watcher}
            link={link}
          />
        ))}
      </ul>
    </div>
  );
}
