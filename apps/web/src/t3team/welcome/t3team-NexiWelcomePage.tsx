import type { ScopedProjectRef } from "@t3tools/contracts";

import { NexiWelcomeAccountRow } from "./t3team-NexiWelcomeAccountRow";
import { NexiWelcomeAgentsSection } from "./t3team-NexiWelcomeAgentsSection";
import { NexiWelcomeBackend } from "./t3team-NexiWelcomeBackend";
import { NexiWelcomeHeader } from "./t3team-NexiWelcomeHeader";
import { NexiWelcomeJiraRow } from "./t3team-NexiWelcomeJiraRow";
import { useWelcomeWizardBrand } from "~/t3team/onboarding/t3team-welcomeWizardBrand";
import { useNexiWelcomeActions } from "./t3team-useNexiWelcomeActions";
import { StartFooter, WelcomePageShell, WelcomeSection } from "./t3team-welcomeLayout";

/**
 * Nexi Work single-page first-run setup. Replaces the multi-step WelcomeWizard when
 * `NEXI_WELCOME_SETUP` is on. Start completes onboarding and lands on the normal home /
 * new-thread surface (Add project → CommandPaletteAddProject).
 *
 * The Role, GitHub, and cloud session / phone rows are not rendered until their actions work.
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

export function NexiWelcomeRows({
  onDone,
}: {
  readonly onDone: (projectRef?: ScopedProjectRef) => void | Promise<void>;
}) {
  const a = useNexiWelcomeActions(onDone);
  const { productName } = useWelcomeWizardBrand();
  return (
    <WelcomePageShell title={`Set up ${productName}`}>
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
        <WelcomeSection title="Account">
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
