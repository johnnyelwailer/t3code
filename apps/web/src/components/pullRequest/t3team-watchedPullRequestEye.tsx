/**
 * Upstream's watching eye (`EyeIcon size-3 text-foreground/75`) with the thread-automations
 * corner dot, painted in the sidebar's status-pill colours. Presentational: the indicator and
 * the `RunToggle` card both draw their state through it.
 */
import { EyeIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import type { WatchedPullRequestTone } from "~/state/t3team-watchedPullRequests.logic";

export const WATCHED_TONE_DOT_CLASS: Record<WatchedPullRequestTone, string | null> = {
  quiet: null,
  working: "bg-sky-500 dark:bg-sky-300/80 motion-safe:animate-status-pulse",
  attention: "bg-amber-500 dark:bg-amber-300/90",
  "needs-you": "bg-indigo-500 dark:bg-indigo-300/90",
};

export const WATCHED_TONE_TEXT_CLASS: Record<WatchedPullRequestTone, string> = {
  quiet: "text-muted-foreground",
  working: "text-sky-600 dark:text-sky-300/80",
  attention: "text-amber-600 dark:text-amber-300/90",
  "needs-you": "text-indigo-600 dark:text-indigo-300/90",
};

export const WATCHED_TONE_LABEL: Record<WatchedPullRequestTone, string> = {
  quiet: "Watching",
  working: "Watching · fixing",
  attention: "Watching · needs attention",
  "needs-you": "Watching · needs you",
};

export function WatchedPullRequestEye({
  tone,
  size = "sm",
  dotClassName,
  className,
}: {
  tone: WatchedPullRequestTone;
  size?: "sm" | "md";
  /** Overrides the tone's dot (the card's muted / emerald / red states). */
  dotClassName?: string | null;
  className?: string;
}) {
  const dot = dotClassName === undefined ? WATCHED_TONE_DOT_CLASS[tone] : dotClassName;
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center text-foreground/75",
        size === "sm" ? "size-4" : "size-5",
        className,
      )}
    >
      <EyeIcon aria-hidden className={size === "sm" ? "size-3" : "size-3.5"} />
      {dot ? (
        <span
          aria-hidden
          className={cn("absolute -right-1 -top-1 size-1.5 rounded-full", dot)}
          data-testid="watched-pull-request-dot"
        />
      ) : null}
    </span>
  );
}
