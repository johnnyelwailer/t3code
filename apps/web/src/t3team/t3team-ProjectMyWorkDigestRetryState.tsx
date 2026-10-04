import { Skeleton } from "~/t3team/components/ui/t3team-skeleton";
import { Spinner } from "~/components/ui/spinner";

/**
 * The digest's "backend starting / retrying" state.
 *
 * Shown when a poll fetch fails or times out — the classic case is a cold start, where the
 * app opens before the backend has finished booting. This is NOT a terminal error: the
 * background poller retries with backoff and the view recovers on its own once the backend
 * answers, so no raw fetch diagnostics ever reach the user here.
 */
export function ProjectMyWorkDigestRetryState() {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 p-4 sm:p-5">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Spinner className="size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm font-medium">Connecting to your work server…</p>
        </div>
        <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
          The digest retries automatically — this happens when the app opens before the backend has
          finished starting. Your work appears here as soon as it answers.
        </p>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-[92%]" />
      </div>
    </div>
  );
}
