import { RefreshCw } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import type { GitHubDiscoveryState } from "~/t3team/hooks/t3team-useGitHubRepositoryDiscovery";

/** Which hosts the picker is searching (with how many repositories each) and a refresh button. */
export function RepositoryPickerStatus({
  discovery,
  loading,
  repoCountByHost,
}: {
  discovery: GitHubDiscoveryState;
  loading: boolean;
  repoCountByHost: ReadonlyMap<string, number>;
}) {
  const busy = loading || discovery.loadingDiscovery;
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {discovery.authStatus === "authenticated" ? (
          discovery.authenticatedHosts.map((entry) => (
            <span key={entry.host} className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-success" />
              {entry.host}
              {entry.account ? <span className="opacity-60">· {entry.account}</span> : null}
              {repoCountByHost.has(entry.host) ? (
                <span className="opacity-60">{repoCountByHost.get(entry.host)}</span>
              ) : null}
            </span>
          ))
        ) : (
          <span>{loading ? "Checking your GitHub sign-in…" : "Not signed in to GitHub"}</span>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => discovery.refresh()}
        disabled={!discovery.backendAvailable || busy}
        aria-label="Refresh repositories"
      >
        <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}
