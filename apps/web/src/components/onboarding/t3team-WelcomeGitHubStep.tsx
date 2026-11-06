import { GitHubSignInAction } from "~/t3team/components/t3team-GitHubSignInAction";
import { useGitHubSignInHosts } from "~/t3team/hooks/t3team-useGitHubSignIn";

import { WelcomeContinueButton, WelcomeStepShell } from "./t3team-WelcomeStepShell";

const NO_KNOWN_HOSTS: ReadonlyArray<string> = [];

/** Optional: sign gh in to the company GitHub and github.com, so agents can read and open PRs. */
export function WelcomeGitHubStep({ onFinish }: { readonly onFinish: () => void }) {
  const hosts = useGitHubSignInHosts(NO_KNOWN_HOSTS);
  return (
    <WelcomeStepShell
      title="Connect GitHub"
      description="Optional. Agents use it to read code and open pull requests. You can add it later in Settings."
      actions={<WelcomeContinueButton label="Finish" onClick={onFinish} />}
    >
      <div className="space-y-3">
        {hosts.map((host) => (
          <GitHubSignInAction key={host} host={host} />
        ))}
      </div>
    </WelcomeStepShell>
  );
}
