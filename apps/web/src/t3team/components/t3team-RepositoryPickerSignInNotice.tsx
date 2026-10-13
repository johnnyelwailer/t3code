import { ShieldAlert } from "lucide-react";

import { PullRequestCopyableCode } from "~/components/pullRequest/PullRequestCopyableCode";
import type { GitHubDiscoveryState } from "~/t3team/hooks/t3team-useGitHubRepositoryDiscovery";
import { CalmNotice } from "~/t3team/t3team-CalmNotice";

/** Shown when no GitHub account is signed in: how to sign in, and a Recheck that re-asks `gh`. */
export function RepositoryPickerSignInNotice({ discovery }: { discovery: GitHubDiscoveryState }) {
  return (
    <CalmNotice
      compact
      icon={ShieldAlert}
      headline="Not signed in to GitHub"
      detail="Add --hostname your.ghe.host for Enterprise. You can still paste a URL above."
      primaryAction={{ label: "Recheck", onClick: () => discovery.refresh() }}
      className="m-3"
    >
      <PullRequestCopyableCode
        value="gh auth login"
        target="the GitHub sign-in command"
        copyLabel="Copy command"
        copiedLabel="Command copied"
        className="font-mono text-2xs"
      />
    </CalmNotice>
  );
}
