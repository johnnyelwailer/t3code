/**
 * The digest header's status strip. Its own file so the header stays inside the t3team line cap.
 */
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import { formatDigestAgo } from "~/t3team/t3team-ProjectMyWorkDigestChips";

/**
 * The digest's data-source status: when Jira was last matched, not when this view fetched —
 * a fetch reads "just now" over a mirror days old. Amber once the sync is over an hour old.
 * While a project's first sync is still running there is no sync time to show, and the fetch time
 * would pass a half-filled mirror off as current, so the strip says the sync is in progress.
 * Falls back to the fetch time only when the server reports no sync at all.
 */
const JIRA_SYNC_STALE_MS = 60 * 60 * 1000;

/** The strip's one line about Jira's freshness; `null` when there is nothing to say. */
export function digestJiraSyncLabel(input: {
  readonly jiraSyncedAt: string | undefined;
  readonly jiraSyncPending: boolean;
  readonly updatedAtMs: number | undefined;
  readonly nowMs: number;
}): string | null {
  if (input.jiraSyncPending) return "Jira sync in progress";
  if (input.jiraSyncedAt !== undefined) {
    return `Jira synced ${formatDigestAgo(input.nowMs, input.jiraSyncedAt)} ago`;
  }
  if (input.updatedAtMs === undefined) return null;
  return `auto · updated ${formatDigestAgo(input.nowMs, new Date(input.updatedAtMs).toISOString())} ago`;
}

export function DigestAutoStatus({
  updatedAtMs,
  jiraSyncedAt,
  jiraSyncPending = false,
  changeRequestNote,
  nowMs,
  refreshing = false,
  needsAttention = false,
}: {
  updatedAtMs: number | undefined;
  jiraSyncedAt: string | undefined;
  /** A project's first Jira sync is still running. */
  jiraSyncPending?: boolean;
  changeRequestNote?: string | undefined;
  nowMs: number;
  /** A round is in flight over content that is already on screen (often a cold-start cache paint). */
  refreshing?: boolean;
  /** The Jira half cannot be trusted (signed out, failing sync): the dot is amber whatever the age. */
  needsAttention?: boolean;
}) {
  // PRs that may be old or missing (the host rate-limited the read): said here, beside the sync.
  const prNotice = changeRequestNote ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex items-center gap-1.5 text-warning">
            <span className="size-1.5 rounded-full bg-warning" aria-hidden />
            Some PRs may be out of date
          </span>
        }
      />
      <TooltipPopup side="top" className="max-w-xs">
        {changeRequestNote}
      </TooltipPopup>
    </Tooltip>
  ) : null;
  // Quiet on purpose: the content below is usable, this only explains why it may be a moment old.
  const refreshNotice = refreshing ? (
    <span className="text-muted-foreground/80" aria-live="polite">
      Refreshing…
    </span>
  ) : null;
  const label = digestJiraSyncLabel({ jiraSyncedAt, jiraSyncPending, updatedAtMs, nowMs });
  if (label === null) {
    return refreshNotice || prNotice ? (
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        {prNotice}
        {refreshNotice}
      </span>
    ) : null;
  }
  const stale =
    needsAttention ||
    (!jiraSyncPending &&
      jiraSyncedAt !== undefined &&
      nowMs - Date.parse(jiraSyncedAt) > JIRA_SYNC_STALE_MS);
  const dot = stale ? "bg-warning" : jiraSyncPending ? "bg-muted-foreground/60" : "bg-success";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
        {label}
      </span>
      {prNotice}
      {refreshNotice}
    </span>
  );
}
