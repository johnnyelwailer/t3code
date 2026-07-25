import { Input } from "~/t3team/components/ui/t3team-input";
import type { GitHubDiscoveryState } from "~/t3team/components/t3team-GitHubRepositoryDiscoverySection";

export function GitHubRepositoryDiscoveryAuthFields({
  discovery,
}: {
  discovery: GitHubDiscoveryState;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Host
        </div>
        <Input
          value={discovery.githubHost}
          onChange={(event) => discovery.setGithubHost(event.target.value)}
          placeholder="github.com or ghe.company.com"
        />
      </div>
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Account
        </div>
        <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm">
          {discovery.githubAccount || "No authenticated account detected"}
        </div>
      </div>
    </div>
  );
}
