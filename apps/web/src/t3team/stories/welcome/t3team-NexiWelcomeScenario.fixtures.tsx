import type { ReactNode } from "react";

import { StartFooter, WelcomePageShell, WelcomeSection } from "./t3team-NexiWelcomeLayout.fixtures";
import {
  AccountBlock,
  AgentsBlock,
  CloudPhoneBlock,
  GitHubBlock,
  JiraBlock,
  RoleBlock,
} from "./t3team-NexiWelcomeSections.fixtures";

export type AccountStoryState =
  | "signedOut"
  | "waitingForCode"
  | "signedIn"
  | "serverUnreachable"
  | "skipped";

export type AgentsStoryState = "ready" | "unreachable" | "none";

export type JiraStoryState = "notConnected" | "tokenFallback" | "connected" | "skipped";

export type GitHubStoryState = "signedOut" | "gheAwaiting" | "bothSignedIn" | "skipped";

export type CloudPhoneStoryState = "locked" | "optIn" | "on" | "skipped";

export type WelcomeScenario = {
  readonly account: AccountStoryState;
  readonly agents: AgentsStoryState;
  readonly roleToggleOn: boolean;
  readonly jira: JiraStoryState;
  readonly github: GitHubStoryState;
  readonly cloudPhone: CloudPhoneStoryState;
  readonly narrow?: boolean;
};

export const SCENARIOS = {
  FreshInstall: {
    account: "signedOut",
    agents: "none",
    roleToggleOn: false,
    jira: "notConnected",
    github: "signedOut",
    cloudPhone: "locked",
  },
  InProgress: {
    account: "waitingForCode",
    agents: "ready",
    roleToggleOn: false,
    jira: "connected",
    github: "gheAwaiting",
    cloudPhone: "locked",
  },
  AllDone: {
    account: "signedIn",
    agents: "ready",
    roleToggleOn: false,
    jira: "connected",
    github: "bothSignedIn",
    cloudPhone: "on",
  },
  SkippedOptional: {
    account: "signedIn",
    agents: "ready",
    roleToggleOn: false,
    jira: "skipped",
    github: "skipped",
    cloudPhone: "skipped",
  },
  RoleToggleOn: {
    account: "signedIn",
    agents: "ready",
    roleToggleOn: true,
    jira: "connected",
    github: "signedOut",
    cloudPhone: "optIn",
  },
  NexploreAIUnreachable: {
    account: "signedIn",
    agents: "unreachable",
    roleToggleOn: false,
    jira: "notConnected",
    github: "signedOut",
    cloudPhone: "optIn",
  },
  ServerUnreachable: {
    account: "serverUnreachable",
    agents: "none",
    roleToggleOn: false,
    jira: "notConnected",
    github: "signedOut",
    cloudPhone: "locked",
  },
  Narrow390: {
    account: "signedOut",
    agents: "none",
    roleToggleOn: false,
    jira: "notConnected",
    github: "signedOut",
    cloudPhone: "locked",
    narrow: true,
  },
} as const satisfies Record<string, WelcomeScenario>;

const noop = () => {};

/** First-run general setup only — rows + Start, no page chrome. */
export function NexiWelcomePageMockup({ scenario }: { readonly scenario: WelcomeScenario }) {
  const entraSignedIn = scenario.account === "signedIn";
  const agentReady = scenario.agents === "ready";
  return (
    <WelcomePageShell narrow={scenario.narrow}>
      <div className="border-t border-border/50">
        <WelcomeSection title="Agents">
          <AgentsBlock state={scenario.agents} />
        </WelcomeSection>
        {scenario.roleToggleOn ? (
          <WelcomeSection title="Role">
            <RoleBlock />
          </WelcomeSection>
        ) : null}
        <WelcomeSection title="Jira">
          <JiraBlock state={scenario.jira} />
        </WelcomeSection>
        <WelcomeSection title="GitHub">
          <GitHubBlock state={scenario.github} />
        </WelcomeSection>
        <WelcomeSection title="Cloud">
          <AccountBlock state={scenario.account} />
          <CloudPhoneBlock state={scenario.cloudPhone} entraSignedIn={entraSignedIn} />
        </WelcomeSection>
      </div>
      <StartFooter agentReady={agentReady} onStart={noop} onStartWithoutAgent={noop} />
    </WelcomePageShell>
  );
}

export function SectionFrame({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <WelcomePageShell>
      <div className="border-t border-border/50">
        <WelcomeSection title={title}>{children}</WelcomeSection>
      </div>
    </WelcomePageShell>
  );
}

export {
  AccountBlock,
  AgentsBlock,
  CloudPhoneBlock,
  GitHubBlock,
  JiraBlock,
  RoleBlock,
} from "./t3team-NexiWelcomeSections.fixtures";
