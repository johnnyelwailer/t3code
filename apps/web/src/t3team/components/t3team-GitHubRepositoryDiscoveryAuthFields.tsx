import { CheckCircle2, ShieldAlert } from "lucide-react";
import { Input } from "~/t3team/components/ui/t3team-input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/t3team/components/ui/t3team-select";
import type { GitHubDiscoveryState } from "~/t3team/components/t3team-GitHubRepositoryDiscoverySection";

/**
 * Host picker shown only when the user is authenticated to more than one `gh` host (e.g.
 * `github.com` and a GitHub Enterprise host). Single-host users keep the plain manual "Host" input
 * below with no added picker noise.
 */
/**
 * The connected/sign-in-required badge treatment for a discovery auth status.
 *
 * Lives beside the auth fields rather than in the section that renders it: this is auth
 * presentation, and the section was over the fork LOC ceiling carrying it.
 */
export function githubAuthTone(
  status: "checking" | "authenticated" | "unauthenticated" | "unknown",
) {
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

export function GitHubAuthHostPicker({ discovery }: { discovery: GitHubDiscoveryState }) {
  if (discovery.authenticatedHosts.length <= 1) {
    return null;
  }

  const selected =
    discovery.authenticatedHosts.find((entry) => entry.host === discovery.githubHost) ??
    discovery.authenticatedHosts.find((entry) => entry.active);

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Authenticated host
      </div>
      <Select
        value={selected?.host ?? null}
        onValueChange={(next) => next && discovery.selectHost(next)}
      >
        <SelectTrigger size="sm" aria-label="Authenticated GitHub host">
          <SelectValue placeholder="Choose a host">
            {selected
              ? `${selected.host}${selected.account ? ` · ${selected.account}` : ""}`
              : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {discovery.authenticatedHosts.map((entry) => (
            <SelectItem key={entry.host} value={entry.host}>
              {entry.host}
              {entry.account ? ` · ${entry.account}` : ""}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
  );
}

export function GitHubRepositoryDiscoveryAuthFields({
  discovery,
}: {
  discovery: GitHubDiscoveryState;
}) {
  return (
    <div className="space-y-3">
      <GitHubAuthHostPicker discovery={discovery} />
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
    </div>
  );
}
