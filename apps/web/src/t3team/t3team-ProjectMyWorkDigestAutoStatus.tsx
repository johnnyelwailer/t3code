/**
 * The digest header's status strip. Its own file so the header stays inside the t3team line cap.
 */
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import { formatDigestAgo } from "~/t3team/t3team-ProjectMyWorkDigestChips";

/**
 * The digest's data-source status: when Jira was last matched, not when this view fetched —
 * a fetch reads "just now" over a mirror days old. Amber once the sync is over an hour old.
 * Falls back to the fetch time only when the server reports no sync at all.
 */
const JIRA_SYNC_STALE_MS = 60 * 60 * 1000;

export function DigestAutoStatus({
  updatedAtMs,
  jiraSyncedAt,
  changeRequestNote,
  nowMs,
  refreshing = false,
}: {
  updatedAtMs: number | undefined;
  jiraSyncedAt: string | undefined;
  changeRequestNote?: string | undefined;
  nowMs: number;
  /** A round is in flight over content that is already on screen (often a cold-start cache paint). */
  refreshing?: boolean;
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
  if (jiraSyncedAt === undefined && updatedAtMs === undefined) {
    return refreshNotice || prNotice ? (
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        {prNotice}
        {refreshNotice}
      </span>
    ) : null;
  }
  const stale = jiraSyncedAt !== undefined && nowMs - Date.parse(jiraSyncedAt) > JIRA_SYNC_STALE_MS;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`size-1.5 rounded-full ${stale ? "bg-warning" : "bg-success"}`}
          aria-hidden
        />
        {jiraSyncedAt !== undefined
          ? `Jira synced ${formatDigestAgo(nowMs, jiraSyncedAt)} ago`
          : `auto · updated ${formatDigestAgo(nowMs, new Date(updatedAtMs ?? nowMs).toISOString())} ago`}
      </span>
      {prNotice}
      {refreshNotice}
    </span>
  );
}
