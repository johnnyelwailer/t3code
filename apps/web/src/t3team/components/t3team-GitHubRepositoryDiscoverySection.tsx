import { useEffect, useState } from "react";
import { CheckCircle2, Github, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
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
  onAddSuggestedUrls,
  onVisibleSuggestionsChange,
}: {
  enabled?: boolean;
  projectKey: string | undefined;
  projectTitle: string | undefined;
  linkedRepositoryUrls: ReadonlyArray<string>;
  onAddSuggestedUrls: (urls: ReadonlyArray<string>) => void;
  onVisibleSuggestionsChange?: (urls: ReadonlyArray<string>) => void;
}) {
  const discovery = useGitHubRepositoryDiscovery({
    enabled,
    projectKey,
    projectTitle,
    linkedRepositoryUrls,
  });

  const selectedUrls = discovery.visibleSuggestedUrls.filter((url) =>
    discovery.selectedSuggestedUrls.has(url),
  );

  useEffect(() => {
    onVisibleSuggestionsChange?.(discovery.visibleSuggestedUrls);
  }, [discovery.visibleSuggestedUrls, onVisibleSuggestionsChange]);

  const status = githubAuthTone(discovery.authStatus);
  const StatusIcon = status.icon;
  const showAuthSkeleton = discovery.authStatus === "checking" || discovery.loadingAuth;
  const isAuthenticated = discovery.authStatus === "authenticated";
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const connectedAccountCount = discovery.authenticatedHosts.length;
  const connectedAccountLabel =
    connectedAccountCount > 1
      ? `Searching ${connectedAccountCount} connected accounts`
      : `Searching ${discovery.githubHost || "GitHub"}`;

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="rounded-md border border-border/70 bg-background/80 p-1.5">
            <Github className="size-4 text-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">Find your GitHub repository</h3>
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
            <span className="font-medium text-foreground">GitHub connected</span>
            <span aria-hidden="true">·</span>
            <span>{connectedAccountLabel}</span>
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

      <div className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
        {discovery.loadingDiscovery ? "Searching connected GitHub accounts…" : null}
      </div>

      {discovery.discoveryWarning ? (
        <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
          {discovery.discoveryWarning}
        </div>
      ) : null}

      {isAuthenticated &&
      !discovery.loadingDiscovery &&
      discovery.visibleSuggestedUrls.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No matching repository found yet. Try the manual options below.
        </p>
      ) : null}

      {discovery.visibleSuggestedUrls.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-foreground">
            <span className="flex items-center gap-2">
              <Sparkles className="size-3.5" />
              Matching repositories
            </span>
            <span className="text-muted-foreground">
              {discovery.visibleSuggestedUrls.length} found
            </span>
          </div>
          <div className="overflow-hidden rounded-md border border-border/70">
            {discovery.visibleSuggestedUrls.map((url) => (
              <label
                key={url}
                className="flex items-center gap-3 border-b border-border/60 px-3 py-2 text-sm last:border-b-0 hover:bg-muted/30"
              >
                <input
                  type="checkbox"
                  checked={discovery.selectedSuggestedUrls.has(url)}
                  onChange={() => discovery.toggleSuggestion(url)}
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{url.replace(/^https?:\/\//, "")}</div>
                </div>
              </label>
            ))}
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => onAddSuggestedUrls(selectedUrls)}
            disabled={selectedUrls.length === 0}
          >
            Add selected repositories
          </Button>
        </div>
      ) : null}
    </section>
  );
}
