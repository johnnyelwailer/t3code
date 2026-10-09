/**
 * The universal "this pull request is watched" indicator (doc 07 §3). Renders nothing unless a
 * live thread watches the open pull request. Hover shows the watchers' card; a click pins it so
 * its buttons are reachable (decision 1): a click never stops a watch, because on a pill inside
 * a ticket row a stray click would end one.
 */
import type { EnvironmentId } from "@t3tools/contracts";
import type { MouseEvent, PointerEvent } from "react";

import { Button } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import {
  useWatchedPullRequestWatchers,
  type PullRequestIdentity,
} from "~/state/t3team-watchedPullRequests";
import { resolveIndicatorTone } from "~/state/t3team-watchedPullRequests.logic";

import { WatchedPullRequestCard } from "./t3team-WatchedPullRequestCard";
import { WATCHED_TONE_LABEL, WatchedPullRequestEye } from "./t3team-watchedPullRequestEye";

function swallow(event: MouseEvent | PointerEvent) {
  // The indicator sits inside links and row buttons; its own clicks stay its own.
  event.stopPropagation();
  event.preventDefault();
}

export function WatchedPullRequestIndicator({
  environmentId,
  host,
  repository,
  number,
  size = "sm",
  className,
}: PullRequestIdentity & {
  /** Defaults to the primary environment, which every PR surface in the fork reads through. */
  environmentId?: EnvironmentId | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const resolvedEnvironmentId = environmentId ?? primaryEnvironmentId;
  const watchers = useWatchedPullRequestWatchers(resolvedEnvironmentId, {
    host,
    repository,
    number,
  });
  if (watchers.length === 0) return null;
  const tone = resolveIndicatorTone(watchers);
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={300}
        closeDelay={150}
        render={
          <Button
            variant="ghost"
            size="icon-tiny"
            className={cn("shrink-0 cursor-default", className)}
          />
        }
        aria-label={`${WATCHED_TONE_LABEL[tone]} · #${number}`}
        data-testid="watched-pull-request-indicator"
        data-tone={tone}
        onPointerDown={swallow}
        onClick={swallow}
      >
        <WatchedPullRequestEye tone={tone} size={size} />
      </PopoverTrigger>
      <PopoverPopup side="top" align="start" width="md" padding="compact">
        <WatchedPullRequestCard
          identity={{ host, repository, number }}
          watchers={watchers}
          link={watchers[0]!.link}
        />
      </PopoverPopup>
    </Popover>
  );
}
