/**
 * The card's one line of counts (doc 07 §2.4). A count is the way into the details: hovering
 * or clicking it lists those pull requests in the indicator's row shape; a row's *Open thread*
 * goes to the watch thread. There is no other details surface.
 */
import type { ReactNode } from "react";

import { HOST_ROW_EVENT_GUARD } from "~/components/pullRequest/t3team-WatchedPullRequestCard";
import { WatchedPullRequestCardRow } from "~/components/pullRequest/t3team-WatchedPullRequestCardRow";
import { WATCHED_TONE_TEXT_CLASS } from "~/components/pullRequest/t3team-watchedPullRequestEye";
import { Button } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import type { WatchedPullRequestWatcher } from "~/state/t3team-watchedPullRequests.logic";
import type { RunToggleCountBucket, RunToggleLinePart } from "~/t3team/t3team-recipeRunToggleState";

const BUCKET_TITLE: Record<RunToggleCountBucket, string> = {
  watched: "Watched",
  "needs-you": "Needs you",
  fixing: "Fixing",
  parked: "Parked",
};

export function selectBucket(
  watchers: ReadonlyArray<WatchedPullRequestWatcher>,
  bucket: RunToggleCountBucket,
): ReadonlyArray<WatchedPullRequestWatcher> {
  switch (bucket) {
    case "watched":
      return watchers;
    case "needs-you":
      return watchers.filter((watcher) => watcher.hasPendingUserInput);
    case "fixing":
      return watchers.filter((watcher) => watcher.tone === "working");
    case "parked":
      return watchers.filter((watcher) => watcher.prWatch?.parked !== undefined);
  }
}

function CountHover({
  part,
  rows,
}: {
  part: Extract<RunToggleLinePart, { kind: "count" }>;
  rows: ReadonlyArray<WatchedPullRequestWatcher>;
}) {
  const label = (
    <span
      className={cn(
        "tabular-nums",
        part.emphasis && ["font-medium", WATCHED_TONE_TEXT_CLASS["needs-you"]],
      )}
    >
      {part.text}
    </span>
  );
  if (rows.length === 0) return label;
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={250}
        closeDelay={150}
        render={<Button variant="link" size="micro" className="cursor-default" />}
        data-testid={`run-toggle-count-${part.bucket}`}
        onClick={(event) => event.stopPropagation()}
      >
        {label}
      </PopoverTrigger>
      <PopoverPopup side="bottom" align="start" width="md" padding="compact">
        <div {...HOST_ROW_EVENT_GUARD}>
          <div className="px-1 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {BUCKET_TITLE[part.bucket]}
          </div>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {rows.map((watcher) => (
              <WatchedPullRequestCardRow
                key={watcher.threadRef.threadId}
                watcher={watcher}
                link={watcher.link}
                ownershipActions="unsure-only"
              />
            ))}
          </ul>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

export function RecipeRunToggleCountLine({
  parts,
  watchers,
  onRetry,
}: {
  parts: ReadonlyArray<RunToggleLinePart>;
  watchers: ReadonlyArray<WatchedPullRequestWatcher>;
  onRetry?: (() => void) | undefined;
}) {
  const rendered: Array<ReactNode> = [];
  parts.forEach((part, index) => {
    if (index > 0) {
      rendered.push(
        <span key={`sep-${index}`} aria-hidden className="text-muted-foreground/60">
          ·
        </span>,
      );
    }
    if (part.kind === "text") {
      rendered.push(
        <span key={index} className={cn(part.muted && "text-muted-foreground/70")}>
          {part.text}
        </span>,
      );
    } else if (part.kind === "count") {
      rendered.push(
        <CountHover key={index} part={part} rows={selectBucket(watchers, part.bucket)} />,
      );
    } else {
      rendered.push(
        <span key={index} className="text-destructive-foreground">
          {part.text}
        </span>,
      );
      if (onRetry) {
        rendered.push(
          <Button
            key={`retry-${index}`}
            variant="outline"
            size="micro"
            onClick={(event) => {
              event.stopPropagation();
              onRetry();
            }}
          >
            Retry
          </Button>,
        );
      }
    }
  });
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-2xs leading-5 text-muted-foreground/80"
      data-testid="run-toggle-count-line"
    >
      {rendered}
    </div>
  );
}
