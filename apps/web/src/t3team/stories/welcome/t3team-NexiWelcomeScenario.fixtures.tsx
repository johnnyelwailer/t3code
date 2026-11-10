import type { ReactNode } from "react";

import {
  BrandHeader,
  MoreInSettingsLine,
  StartFooter,
  WelcomePageShell,
  WelcomeSection,
} from "./t3team-NexiWelcomeLayout.fixtures";
import {
  AccountBlock,
  AgentsBlock,
  CloudPhoneBlock,
  GitHubBlock,
  JiraBlock,
  ProjectBlock,
  RoleBlock,
} from "./t3team-NexiWelcomeSections.fixtures";

export type AccountStoryState =
  | "signedOut"
  | "waitingForCode"
  | "signedIn"
  | "serverUnreachable"
  | "skipped";

export type AgentsStoryState = "ready" | "unreachable" | "none" | "addMoreOpen";

export type JiraStoryState = "notConnected" | "tokenFallback" | "connected" | "skipped";

export type ProjectStoryState = "idle" | "choosing" | "chosen" | "skipped";

export type GitHubStoryState = "signedOut" | "gheAwaiting" | "bothSignedIn" | "skipped";

export type CloudPhoneStoryState = "locked" | "optIn" | "on" | "skipped";

export type WelcomeScenario = {
  readonly account: AccountStoryState;
  readonly agents: AgentsStoryState;
  readonly roleToggleOn: boolean;
  readonly jira: JiraStoryState;
  readonly project: ProjectStoryState;
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
    project: "idle",
    github: "signedOut",
    cloudPhone: "locked",
  },
  InProgress: {
    account: "waitingForCode",
    agents: "ready",
    roleToggleOn: false,
    jira: "connected",
    project: "choosing",
    github: "gheAwaiting",
    cloudPhone: "locked",
  },
  AllDone: {
    account: "signedIn",
    agents: "ready",
    roleToggleOn: false,
    jira: "connected",
    project: "chosen",
    github: "bothSignedIn",
    cloudPhone: "on",
  },
  SkippedOptional: {
    account: "signedIn",
    agents: "ready",
    roleToggleOn: false,
    jira: "skipped",
    project: "skipped",
    github: "skipped",
    cloudPhone: "skipped",
  },
  RoleToggleOn: {
    account: "signedIn",
    agents: "ready",
    roleToggleOn: true,
    jira: "connected",
    project: "idle",
    github: "signedOut",
    cloudPhone: "optIn",
  },
  NexploreAIUnreachable: {
    account: "signedIn",
    agents: "unreachable",
    roleToggleOn: false,
    jira: "notConnected",
    project: "idle",
    github: "signedOut",
    cloudPhone: "optIn",
  },
  ServerUnreachable: {
    account: "serverUnreachable",
    agents: "none",
    roleToggleOn: false,
    jira: "notConnected",
    project: "idle",
    github: "signedOut",
    cloudPhone: "locked",
  },
  Narrow390: {
    account: "signedOut",
    agents: "none",
    roleToggleOn: false,
    jira: "notConnected",
    project: "idle",
    github: "signedOut",
    cloudPhone: "locked",
    narrow: true,
  },
} as const satisfies Record<string, WelcomeScenario>;

const noop = () => {};

export function NexiWelcomePageMockup({ scenario }: { readonly scenario: WelcomeScenario }) {
  const entraSignedIn = scenario.account === "signedIn";
  const agentReady = scenario.agents === "ready";
  return (
    <WelcomePageShell narrow={scenario.narrow}>
      <BrandHeader />
      <div className="border-t border-border/60">
        <WelcomeSection title="Account" recommended>
          <AccountBlock state={scenario.account} />
        </WelcomeSection>
        <WelcomeSection title="Agents">
          <AgentsBlock state={scenario.agents} />
        </WelcomeSection>
        {scenario.roleToggleOn ? (
          <WelcomeSection title="Role" optional>
            <RoleBlock />
          </WelcomeSection>
        ) : null}
        <WelcomeSection title="Jira" recommended>
          <JiraBlock state={scenario.jira} />
        </WelcomeSection>
        <WelcomeSection title="Project" optional>
          <ProjectBlock state={scenario.project} />
        </WelcomeSection>
        <WelcomeSection title="GitHub" optional>
          <GitHubBlock state={scenario.github} />
        </WelcomeSection>
        <WelcomeSection title="Cloud & phone" optional>
          <CloudPhoneBlock state={scenario.cloudPhone} entraSignedIn={entraSignedIn} />
        </WelcomeSection>
      </div>
      <MoreInSettingsLine />
      <StartFooter agentReady={agentReady} onStart={noop} onStartWithoutAgent={noop} />
    </WelcomePageShell>
  );
}

/** Section-only frame for per-section stories. */
export function SectionFrame({
  title,
  recommended,
  optional,
  children,
}: {
  readonly title: string;
  readonly recommended?: boolean;
  readonly optional?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <WelcomePageShell>
      <BrandHeader />
      <div className="border-t border-border/60">
        <WelcomeSection title={title} recommended={recommended} optional={optional}>
          {children}
        </WelcomeSection>
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
  ProjectBlock,
  RoleBlock,
} from "./t3team-NexiWelcomeSections.fixtures";
