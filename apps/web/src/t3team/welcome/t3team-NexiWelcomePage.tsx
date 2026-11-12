import type { ScopedProjectRef } from "@t3tools/contracts";

import { NexiWelcomeAccountRow } from "./t3team-NexiWelcomeAccountRow";
import { NexiWelcomeAgentsSection } from "./t3team-NexiWelcomeAgentsSection";
import { NexiWelcomeBackend } from "./t3team-NexiWelcomeBackend";
import { NexiWelcomeCloudPhoneSection } from "./t3team-NexiWelcomeCloudPhoneSection";
import { NexiWelcomeHeader } from "./t3team-NexiWelcomeHeader";
import { NexiWelcomeGitHubRow } from "./t3team-NexiWelcomeGitHubRow";
import { NexiWelcomeJiraRow } from "./t3team-NexiWelcomeJiraRow";
import { NexiWelcomeRoleSection } from "./t3team-NexiWelcomeRoleSection";
import { useNexiWelcomeActions } from "./t3team-useNexiWelcomeActions";
import { StartFooter, WelcomePageShell, WelcomeSection } from "./t3team-welcomeLayout";

/**
 * Nexi Work single-page first-run setup. Replaces the multi-step WelcomeWizard when
 * `NEXI_WELCOME_SETUP` is on. Start completes onboarding and lands on the normal home /
 * new-thread surface (Add project → CommandPaletteAddProject).
 */
export function NexiWelcomePage(props: {
  readonly onDone: (projectRef?: ScopedProjectRef) => void | Promise<void>;
}) {
  return (
    <NexiWelcomeBackend>
      <NexiWelcomeRows onDone={props.onDone} />
    </NexiWelcomeBackend>
  );
}

function NexiWelcomeRows({
  onDone,
}: {
  readonly onDone: (projectRef?: ScopedProjectRef) => void | Promise<void>;
}) {
  const a = useNexiWelcomeActions(onDone);
  const entraSignedIn = a.account.account?.auth._tag === "SignedIn";
  const cloudSessions = a.cloud.sessions;
  const cloudReady = cloudSessions.some((session) => session.phase === "ready");
  const cloudPending =
    a.cloud.createPending ||
    cloudSessions.some(
      (session) =>
        session.phase === "requested" ||
        session.phase === "queued" ||
        session.phase === "preparing" ||
        session.phase === "starting",
    );

  return (
    <WelcomePageShell>
      <NexiWelcomeHeader />
      <div className="border-t border-border/50">
        <WelcomeSection title="Agents">
          <NexiWelcomeAgentsSection
            rows={a.agentRows}
            toolStates={a.toolStates}
            onInstall={a.onInstallTool}
            onSignIn={a.onSignInTool}
            onCopyAndOpenTool={a.onCopyAndOpenTool}
            onOpenProviderSetup={a.onOpenProviderSetup}
          />
        </WelcomeSection>
        {a.roleEnabled ? (
          <WelcomeSection title="Role">
            <NexiWelcomeRoleSection
              profiles={a.packProfiles}
              selectedId={a.chosenRole}
              onChoose={a.onChooseRole}
            />
          </WelcomeSection>
        ) : null}
        <WelcomeSection title="Jira">
          <NexiWelcomeJiraRow
            enabled={a.jiraEnabled}
            disabledReason={a.jiraDisabledReason}
            accounts={a.jiraAccounts}
            check={a.jiraCheck}
            skipped={a.skipped.jira}
            connecting={a.jiraConnecting}
            onConnect={a.onConnectJira}
            onRetry={a.onRetryJira}
            onSkip={() => a.skip("jira")}
          />
        </WelcomeSection>
        <WelcomeSection title="GitHub">
          <NexiWelcomeGitHubRow
            host={a.githubHosts[0]}
            state={a.githubPrimary.state}
            skipped={a.skipped.github}
            onStart={a.githubPrimary.start}
            onCopyAndOpen={a.onCopyAndOpenGitHubPrimary}
            onSkip={() => a.skip("github")}
            showSkip
          />
          <NexiWelcomeGitHubRow
            host={a.githubHosts[1]}
            state={a.githubSecondary.state}
            skipped={a.skipped.github}
            onStart={a.githubSecondary.start}
            onCopyAndOpen={a.onCopyAndOpenGitHubSecondary}
            onSkip={() => a.skip("github")}
            showSkip={false}
          />
        </WelcomeSection>
        <WelcomeSection title="Cloud">
          <NexiWelcomeAccountRow
            account={a.account.account}
            check={a.accountCheck}
            pending={a.account.pending}
            error={a.account.error}
            skipped={a.skipped.account}
            onSignIn={a.account.signIn}
            onOpenVerification={a.account.openVerification}
            onSkip={() => a.skip("account")}
            onRetry={a.onRetryAccount}
          />
          <NexiWelcomeCloudPhoneSection
            entraSignedIn={Boolean(entraSignedIn) && !a.skipped.account}
            skipped={a.skipped.cloud}
            cloudEnabled={a.cloudFlag}
            cloudAvailable={a.cloud.available}
            cloudConfigured={a.cloud.configured}
            cloudPending={cloudPending}
            cloudReady={cloudReady}
            onTurnOnCloud={a.cloud.onCreate}
            onSetupPhone={a.onSetupPhone}
            onSkip={() => a.skip("cloud")}
          />
        </WelcomeSection>
      </div>
      <StartFooter
        agentReady={a.agentReady}
        onStart={() => void a.onStart()}
        onStartWithoutAgent={() => void a.onStart()}
      />
    </WelcomePageShell>
  );
}
