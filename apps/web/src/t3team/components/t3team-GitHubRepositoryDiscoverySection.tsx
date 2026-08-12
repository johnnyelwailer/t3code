import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Github, RefreshCw } from "lucide-react";
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
  onAddRepositories,
  onRemoveRepository,
  onVisibleSuggestionsChange,
}: {
  enabled?: boolean;
  projectKey: string | undefined;
  projectTitle: string | undefined;
  linkedRepositoryUrls: ReadonlyArray<string>;
  onAddRepositories?: (urls: ReadonlyArray<string>) => void;
  onRemoveRepository?: (url: string) => void;
  onVisibleSuggestionsChange?: (urls: ReadonlyArray<string>) => void;
}) {
  const discovery = useGitHubRepositoryDiscovery({
    enabled,
    projectKey,
    projectTitle,
    linkedRepositoryUrls,
  });

  const [suppressedAutoAddUrls, setSuppressedAutoAddUrls] = useState<ReadonlySet<string>>(
    new Set(),
  );

  useEffect(() => {
    setSuppressedAutoAddUrls(new Set());
  }, [projectKey, projectTitle]);

  const autoAddSuggestions = useMemo(
    () => discovery.visibleSuggestedUrls.filter((url) => !suppressedAutoAddUrls.has(url)),
    [discovery.visibleSuggestedUrls, suppressedAutoAddUrls],
  );

  useEffect(() => {
    onVisibleSuggestionsChange?.(autoAddSuggestions);
  }, [autoAddSuggestions, onVisibleSuggestionsChange]);

  const status = githubAuthTone(discovery.authStatus);
  const StatusIcon = status.icon;
  const showAuthSkeleton = discovery.authStatus === "checking" || discovery.loadingAuth;
  const isAuthenticated = discovery.authStatus === "authenticated";
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const connectedAccounts = [
    ...new Map(
      discovery.authenticatedHosts.map((entry) => [
        entry.host,
        entry.account ? `${entry.host} (${entry.account})` : entry.host,
      ]),
    ).values(),
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-1 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <Github className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Find your repository</h3>
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

      <div className="space-y-3">
        {showAuthSkeleton ? (
          <Skeleton className="h-8 w-full rounded-lg" />
        ) : isAuthenticated ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-live="polite">
              <span className="mr-1 inline-flex items-center gap-1.5 font-medium text-foreground">
                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                Connected
              </span>
              {connectedAccounts.map((account) => (
                <span
                  key={account}
                  className="rounded-full bg-muted/70 px-2 py-1 text-[11px] text-muted-foreground"
                >
                  {account}
                </span>
              ))}
              {discovery.loadingDiscovery ? (
                <RefreshCw className="ml-1 size-3 animate-spin text-muted-foreground" />
              ) : null}
            </div>

            {discovery.discoveryWarning ? (
              <div className="rounded-lg border border-border/60 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                {discovery.discoveryWarning}
              </div>
            ) : null}

            {!discovery.loadingDiscovery && discovery.suggestedUrls.length === 0 ? (
              <p className="text-xs text-muted-foreground">No match found</p>
            ) : null}

            {discovery.suggestedUrls.length > 0 ? (
              <div className="divide-y divide-emerald-200/70 border-y border-emerald-200/80 bg-emerald-50/45 dark:divide-emerald-900/70 dark:border-emerald-900/70 dark:bg-emerald-950/20">
                {discovery.suggestedUrls.map((url) => (
                  <div key={url} className="flex items-center gap-2.5 px-2.5 py-2.5">
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {url.replace(/^https?:\/\//, "")}
                    </span>
                    {linkedRepositoryUrls.includes(url) ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                        Added
                      </span>
                    ) : null}
                    <Button
                      variant={linkedRepositoryUrls.includes(url) ? "ghost" : "outline"}
                      size="xs"
                      onClick={() => {
                        if (linkedRepositoryUrls.includes(url)) {
                          setSuppressedAutoAddUrls((current) => new Set([...current, url]));
                          onRemoveRepository?.(url);
                        } else {
                          setSuppressedAutoAddUrls((current) => {
                            const next = new Set(current);
                            next.delete(url);
                            return next;
                          });
                          onAddRepositories?.([url]);
                        }
                      }}
                    >
                      {linkedRepositoryUrls.includes(url) ? "Remove" : "Add"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}

            <GitHubRepositoryDiscoveryAdvancedOptions
              open={showAdvancedOptions}
              onOpenChange={setShowAdvancedOptions}
            >
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/25 p-3">
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <StatusIcon className="size-3.5 text-amber-600 dark:text-amber-400" />
              <span>{status.label}</span>
            </div>
            <GitHubRepositoryDiscoveryAdvancedOptions
              open={showAdvancedOptions}
              onOpenChange={setShowAdvancedOptions}
            >
              <div className="rounded-lg border border-border/60 bg-muted/25 p-3">
                <GitHubRepositoryDiscoveryAuthFields discovery={discovery} />
                {discovery.authDetail ? (
                  <div className="mt-2 text-xs text-muted-foreground">{discovery.authDetail}</div>
                ) : null}
              </div>
            </GitHubRepositoryDiscoveryAdvancedOptions>
          </>
        )}

        {/* Keep the authenticated and unauthenticated states visually aligned. */}
        {!showAuthSkeleton && !isAuthenticated && discovery.discoveryWarning ? (
          <div className="rounded-lg border border-border/60 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
            {discovery.discoveryWarning}
          </div>
        ) : null}
      </div>
    </section>
  );
}
