import type { AtlassianAccountStatus } from "~/t3team/backend/t3team-atlassianAccountStatus";
import type { WelcomeCheck } from "~/t3team/welcome/t3team-welcomeCheck.logic";
import { JiraIcon } from "~/t3team/components/brand/t3team-AtlassianLogos";
import {
  PrimaryAction,
  SecondaryAction,
  ServiceMark,
  StatusLabel,
  WelcomeItem,
} from "~/t3team/welcome/t3team-welcomeLayout";

export type NexiWelcomeJiraRowProps = {
  readonly enabled: boolean;
  readonly disabledReason: string;
  readonly accounts: ReadonlyArray<AtlassianAccountStatus> | null;
  readonly check: WelcomeCheck;
  readonly skipped: boolean;
  readonly connecting: boolean;
  readonly onConnect: () => void;
  readonly onRetry: () => void;
  readonly onSkip: () => void;
};

export function NexiWelcomeJiraRow({
  enabled,
  disabledReason,
  accounts,
  check,
  skipped,
  connecting,
  onConnect,
  onRetry,
  onSkip,
}: NexiWelcomeJiraRowProps) {
  const mark = (
    <ServiceMark label="Jira">
      <JiraIcon aria-hidden className="size-5" />
    </ServiceMark>
  );

  if (skipped) {
    return (
      <WelcomeItem
        mark={mark}
        title="Jira"
        status={<StatusLabel status="skipped" label="Skipped" />}
      />
    );
  }

  const connected = accounts?.find((account) => account.status === "connected");
  if (connected) {
    return (
      <WelcomeItem
        mark={mark}
        title="Jira"
        description={
          [connected.accountUrl, connected.label].filter(Boolean).join(" · ") || undefined
        }
        status={<StatusLabel status="connected" label="Connected" />}
      />
    );
  }

  if (!enabled) {
    return (
      <WelcomeItem
        mark={mark}
        title="Jira"
        description={disabledReason}
        status={<StatusLabel status="locked" label="Unavailable" />}
      />
    );
  }

  if (check === "failed") {
    return (
      <WelcomeItem
        mark={mark}
        title="Jira"
        description="Can't check Jira right now."
        action={
          <div className="flex items-center gap-2">
            <SecondaryAction onClick={onSkip}>Skip</SecondaryAction>
            <PrimaryAction onClick={onRetry}>Retry</PrimaryAction>
          </div>
        }
      />
    );
  }

  return (
    <WelcomeItem
      mark={mark}
      title="Jira"
      description={check === "checking" ? "Checking…" : undefined}
      action={
        <div className="flex items-center gap-2">
          <SecondaryAction onClick={onSkip}>Skip</SecondaryAction>
          <PrimaryAction onClick={onConnect} disabled={connecting || check === "checking"}>
            {connecting ? "Connecting…" : "Connect"}
          </PrimaryAction>
        </div>
      }
    />
  );
}
