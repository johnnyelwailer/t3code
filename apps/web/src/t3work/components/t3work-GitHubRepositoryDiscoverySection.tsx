/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Github,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { cn } from "~/lib/utils";
import { GitHubRepositoryDiscoveryAuthFields } from "~/t3work/components/t3work-GitHubRepositoryDiscoveryAuthFields";
import { Button } from "~/t3work/components/ui/t3work-button";
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

export type GitHubDiscoveryState = ReturnType<typeof useGitHubRepositoryDiscovery>;

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

  const status = authTone(discovery.authStatus);
  const StatusIcon = status.icon;
  const showAuthSkeleton = discovery.authStatus === "checking" || discovery.loadingAuth;
  const isAuthenticated = discovery.authStatus === "authenticated";
  const [showAuthDetails, setShowAuthDetails] = useState(!isAuthenticated);

  useEffect(() => {
    if (!showAuthSkeleton) {
      setShowAuthDetails(!isAuthenticated);
    }
  }, [isAuthenticated, showAuthSkeleton]);

  return (
    <section className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="rounded-md border border-border/70 bg-background/80 p-2">
            <Github className="size-4 text-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-sm font-semibold">GitHub repository discovery</h3>
              {!isAuthenticated ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.badge}`}
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
          aria-label="Refresh GitHub authentication status"
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
        <Collapsible open={showAuthDetails} onOpenChange={setShowAuthDetails}>
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Connected</span>
                <span className="truncate text-xs text-muted-foreground">
                  {discovery.githubHost || "github.com"}
                </span>
              </div>
              <ChevronDown
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  showAuthDetails && "rotate-180",
                )}
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <GitHubRepositoryDiscoveryAuthFields discovery={discovery} />
            {discovery.authDetail ? (
              <div className="mt-2 text-xs text-muted-foreground">{discovery.authDetail}</div>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <>
          <GitHubRepositoryDiscoveryAuthFields discovery={discovery} />
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
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
          </div>
        </>
      )}

      <div className="h-4 text-xs text-muted-foreground" aria-live="polite">
        {discovery.loadingDiscovery ? "Searching..." : ""}
      </div>

      {discovery.discoveryWarning ? (
        <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
          {discovery.discoveryWarning}
        </div>
      ) : null}

      {discovery.visibleSuggestedUrls.length > 0 ? (
        <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" />
            {discovery.visibleSuggestedUrls.length} matches.
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
