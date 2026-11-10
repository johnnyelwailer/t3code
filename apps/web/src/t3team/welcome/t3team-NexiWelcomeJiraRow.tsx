import type { AtlassianAccountStatus } from "~/t3team/backend/t3team-atlassianAccountStatus";
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
  readonly loading: boolean;
  readonly error: string | null;
  readonly skipped: boolean;
  readonly connecting: boolean;
  readonly onConnect: () => void;
  readonly onSkip: () => void;
};

export function NexiWelcomeJiraRow({
  enabled,
  disabledReason,
  accounts,
  loading,
  error,
  skipped,
  connecting,
  onConnect,
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

  return (
    <WelcomeItem
      mark={mark}
      title="Jira"
      description={error ?? (loading ? "Checking…" : undefined)}
      action={
        <div className="flex items-center gap-2">
          <SecondaryAction onClick={onSkip}>Skip</SecondaryAction>
          <PrimaryAction onClick={onConnect} disabled={connecting || loading}>
            {connecting ? "Connecting…" : "Connect"}
          </PrimaryAction>
        </div>
      }
    />
  );
}
