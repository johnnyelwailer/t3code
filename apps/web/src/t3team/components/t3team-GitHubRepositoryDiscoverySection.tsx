import { useEffect, useState } from "react";
import { CheckCircle2, Github, RefreshCw, ShieldAlert } from "lucide-react";
import { GitHubRepositoryDiscoveryAdvancedOptions } from "~/t3team/components/t3team-GitHubRepositoryDiscoveryAdvancedOptions";
import {
  GitHubAuthHostPicker,
  GitHubRepositoryDiscoveryAuthFields,
} from "~/t3team/components/t3team-GitHubRepositoryDiscoveryAuthFields";
import { Button } from "~/t3team/components/ui/t3team-button";
import { Skeleton } from "~/t3team/components/ui/t3team-skeleton";
import { useGitHubRepositoryDiscovery } from "~/t3team/hooks/t3team-useGitHubRepositoryDiscovery";
import { githubAuthTone } from "~/t3team/components/t3team-GitHubRepositoryDiscoveryAuthFields";

// Re-exported: this was its original home, and other modules import it from here.
export type { GitHubDiscoveryState } from "~/t3team/hooks/t3team-useGitHubRepositoryDiscovery";

export function GitHubRepositoryDiscoverySection({
  enabled = true,
  projectKey,
  projectTitle,
  linkedRepositoryUrls,
  onVisibleSuggestionsChange,
}: {
  enabled?: boolean;
  projectKey: string | undefined;
  projectTitle: string | undefined;
  linkedRepositoryUrls: ReadonlyArray<string>;
  onVisibleSuggestionsChange?: (urls: ReadonlyArray<string>) => void;
}) {
  const discovery = useGitHubRepositoryDiscovery({
    enabled,
    projectKey,
    projectTitle,
    linkedRepositoryUrls,
  });

  useEffect(() => {
    onVisibleSuggestionsChange?.(discovery.visibleSuggestedUrls);
  }, [discovery.visibleSuggestedUrls, onVisibleSuggestionsChange]);

  const status = githubAuthTone(discovery.authStatus);
  const StatusIcon = status.icon;
  const showAuthSkeleton = discovery.authStatus === "checking" || discovery.loadingAuth;
  const isAuthenticated = discovery.authStatus === "authenticated";
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const connectedAccountCount = discovery.authenticatedHosts.length;
  const connectedAccountLabel = [
    ...new Map(
      discovery.authenticatedHosts.map((entry) => [
        entry.host,
        entry.account ? `${entry.host} (${entry.account})` : entry.host,
      ]),
    ).values(),
  ].join(" · ");
  const connectedSearchLabel = discovery.loadingDiscovery
    ? connectedAccountCount > 1
      ? `Searching ${connectedAccountCount} connected accounts`
      : `Searching ${discovery.githubHost || "GitHub"}`
    : connectedAccountLabel || "Connected GitHub accounts";

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="rounded-md border border-border/70 bg-background/80 p-1.5">
            <Github className="size-4 text-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">Find your repository</h3>
              {!isAuthenticated ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium ${status.badge}`}
                >
                  <StatusIcon className="size-3.5" />
                  {status.label}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => void discovery.refresh()}
          disabled={!discovery.backendAvailable || showAuthSkeleton || discovery.loadingDiscovery}
          aria-label="Refresh repository discovery"
        >
          <RefreshCw
            className={`size-3.5 ${showAuthSkeleton || discovery.loadingDiscovery ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {showAuthSkeleton ? (
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      ) : isAuthenticated ? (
        <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="font-medium text-foreground">Connected</span>
            <span aria-hidden="true">·</span>
            <span>{connectedSearchLabel}</span>
          </div>
          <GitHubRepositoryDiscoveryAdvancedOptions
            open={showAdvancedOptions}
            onOpenChange={setShowAdvancedOptions}
          >
            <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Search one host manually.</p>
              <GitHubAuthHostPicker discovery={discovery} />
              <GitHubRepositoryDiscoveryAuthFields discovery={discovery} />
              {discovery.authDetail ? (
                <div className="text-xs text-muted-foreground">{discovery.authDetail}</div>
              ) : null}
            </div>
          </GitHubRepositoryDiscoveryAdvancedOptions>
        </>
      ) : (
        <>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Sign in with{" "}
              <span className="font-mono">
                gh auth login --hostname {discovery.githubHost || "github.com"}
              </span>
            </span>
          </div>
          <GitHubRepositoryDiscoveryAdvancedOptions
            open={showAdvancedOptions}
            onOpenChange={setShowAdvancedOptions}
          >
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <GitHubRepositoryDiscoveryAuthFields discovery={discovery} />
              {discovery.authDetail ? (
                <div className="mt-2 text-xs text-muted-foreground">{discovery.authDetail}</div>
              ) : null}
            </div>
          </GitHubRepositoryDiscoveryAdvancedOptions>
        </>
      )}

      {discovery.discoveryWarning ? (
        <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
          {discovery.discoveryWarning}
        </div>
      ) : null}

      {isAuthenticated && !discovery.loadingDiscovery && discovery.suggestedUrls.length === 0 ? (
        <p className="text-xs text-muted-foreground">No matching repository found.</p>
      ) : null}

      {discovery.suggestedUrls.length > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              Matching repositories
            </span>
            <span className="text-muted-foreground">{discovery.suggestedUrls.length} found</span>
          </div>
          <div className="overflow-hidden rounded-md border border-border/70">
            {discovery.suggestedUrls.map((url) => (
              <div
                key={url}
                className="flex items-center gap-3 border-b border-border/60 px-3 py-2 text-sm last:border-b-0 hover:bg-muted/30"
              >
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{url.replace(/^https?:\/\//, "")}</div>
                  <div className="text-xs text-muted-foreground">
                    {linkedRepositoryUrls.includes(url) ? "Added automatically" : "Matching"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
