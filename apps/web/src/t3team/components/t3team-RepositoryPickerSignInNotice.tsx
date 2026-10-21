import { ShieldAlert } from "lucide-react";

import { GitHubSignInAction } from "~/t3team/components/t3team-GitHubSignInAction";
import type { GitHubDiscoveryState } from "~/t3team/hooks/t3team-useGitHubRepositoryDiscovery";
import { useGitHubSignInHosts } from "~/t3team/hooks/t3team-useGitHubSignIn";
import { CalmNotice } from "~/t3team/t3team-CalmNotice";

/** Shown when no GitHub account is signed in: a sign-in per likely host, and a Recheck. */
export function RepositoryPickerSignInNotice({ discovery }: { discovery: GitHubDiscoveryState }) {
  const hosts = useGitHubSignInHosts([discovery.githubHost]);
  return (
    <CalmNotice
      compact
      icon={ShieldAlert}
      headline="Not signed in to GitHub"
      detail="Sign in here, or paste a repository URL above."
      primaryAction={{ label: "Recheck", onClick: () => discovery.refresh() }}
      className="m-3"
    >
      <div className="flex flex-col gap-2">
        {hosts.map((host) => (
          <GitHubSignInAction key={host} host={host} onSignedIn={discovery.refresh} />
        ))}
      </div>
    </CalmNotice>
  );
}
