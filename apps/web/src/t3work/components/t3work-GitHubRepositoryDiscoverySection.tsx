import { CheckCircle2, Github, RefreshCw, Search, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "~/t3work/components/ui/t3work-button";
import { Input } from "~/t3work/components/ui/t3work-input";
import { Skeleton } from "~/t3work/components/ui/t3work-skeleton";
import { useGitHubRepositoryDiscovery } from "~/t3work/hooks/t3work-useGitHubRepositoryDiscovery";

function authTone(status: "checking" | "authenticated" | "unauthenticated" | "unknown") {
  if (status === "authenticated") {
    return {
      badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      label: "Connected",
      icon: CheckCircle2,
    };
  }
  return {
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    label: status === "checking" ? "Checking" : "Sign in required",
    icon: ShieldAlert,
  };
}

export function GitHubRepositoryDiscoverySection({
  enabled = true,
  projectKey,
  projectTitle,
  linkedRepositoryUrls,
  onAddSuggestedUrls,
}: {
  enabled?: boolean;
  projectKey: string | undefined;
  projectTitle: string | undefined;
  linkedRepositoryUrls: ReadonlyArray<string>;
  onAddSuggestedUrls: (urls: ReadonlyArray<string>) => void;
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
  const status = authTone(discovery.authStatus);
  const StatusIcon = status.icon;
  const showAuthSkeleton = discovery.authStatus === "checking" || discovery.loadingAuth;

  return (
    <section className="space-y-3 rounded-xl border border-border/70 bg-gradient-to-b from-card to-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-border/70 bg-background/80 p-2.5 shadow-sm">
            <Github className="size-4 text-foreground" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">GitHub repository discovery</h3>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.badge}`}
              >
                <StatusIcon className="size-3.5" />
                {status.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Reuse existing gh authentication and pull likely codebase matches for this Jira
              project.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void discovery.refresh()}
          disabled={!discovery.backendAvailable || showAuthSkeleton || discovery.loadingDiscovery}
        >
          <RefreshCw
            className={`mr-1 size-3.5 ${showAuthSkeleton || discovery.loadingDiscovery ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {showAuthSkeleton ? (
        <div className="space-y-3 rounded-lg border border-border/70 bg-background/70 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/70 bg-background/70 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Host
              </div>
              <Input
                value={discovery.githubHost}
                onChange={(event) => discovery.setGithubHost(event.target.value)}
                placeholder="github.com or ghe.company.com"
                className="mt-2"
              />
            </div>
            <div className="rounded-lg border border-border/70 bg-background/70 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Account
              </div>
              <div className="mt-2 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm">
                {discovery.githubAccount || "No authenticated account detected"}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background/70 p-3 text-xs">
            {discovery.authStatus === "authenticated" ? (
              <div className="flex items-start gap-2 text-muted-foreground">
                <CheckCircle2 className="mt-0.5 size-3.5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  GitHub CLI is authenticated and ready to search for matching repositories.
                  {discovery.authDetail ? <div className="mt-1">{discovery.authDetail}</div> : null}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-muted-foreground">
                <ShieldAlert className="mt-0.5 size-3.5 text-amber-600 dark:text-amber-400" />
                <div>
                  Sign in with{" "}
                  <span className="font-mono">
                    gh auth login --hostname {discovery.githubHost || "github.com"}
                  </span>
                  {discovery.authDetail ? <div className="mt-1">{discovery.authDetail}</div> : null}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {discovery.loadingDiscovery ? (
        <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <Search className="size-3.5" />
            Searching GitHub / GHE for repository matches...
          </div>
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-4/5 rounded-lg" />
        </div>
      ) : null}

      {discovery.discoveryWarning ? (
        <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
          {discovery.discoveryWarning}
        </div>
      ) : null}

      {discovery.visibleSuggestedUrls.length > 0 ? (
        <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" />
            Found {discovery.visibleSuggestedUrls.length} likely repository matches.
          </div>
          <div className="space-y-2">
            {discovery.visibleSuggestedUrls.map((url) => (
              <label
                key={url}
                className="flex items-start gap-3 rounded-lg border border-primary/15 bg-background/70 px-3 py-2.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={discovery.selectedSuggestedUrls.has(url)}
                  onChange={() => discovery.toggleSuggestion(url)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{url.replace(/^https?:\/\//, "")}</div>
                  <div className="truncate text-xs text-muted-foreground">{url}</div>
                </div>
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => onAddSuggestedUrls(selectedUrls)}
            disabled={selectedUrls.length === 0}
          >
            Add selected suggestions
          </Button>
        </div>
      ) : null}
    </section>
  );
}
