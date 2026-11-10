import type { AccountStatus } from "@t3tools/contracts";

import { MicrosoftEntraMark } from "~/t3team/welcome/t3team-MicrosoftEntraMark";
import {
  PrimaryAction,
  SecondaryAction,
  ServiceMark,
  StatusLabel,
  WelcomeItem,
} from "~/t3team/welcome/t3team-welcomeLayout";

export type NexiWelcomeAccountRowProps = {
  readonly account: AccountStatus | null;
  readonly loaded: boolean;
  readonly pending: boolean;
  readonly error: string | null;
  readonly skipped: boolean;
  readonly onSignIn: () => void;
  readonly onOpenVerification: () => void;
  readonly onSkip: () => void;
  readonly onRetry: () => void;
};

export function NexiWelcomeAccountRow({
  account,
  loaded,
  pending,
  error,
  skipped,
  onSignIn,
  onOpenVerification,
  onSkip,
  onRetry,
}: NexiWelcomeAccountRowProps) {
  const mark = (
    <ServiceMark label="Nexplore">
      <MicrosoftEntraMark />
    </ServiceMark>
  );

  if (skipped) {
    return (
      <WelcomeItem
        mark={mark}
        title="Nexplore"
        status={<StatusLabel status="skipped" label="Skipped" />}
      />
    );
  }

  if (!loaded && error) {
    return (
      <WelcomeItem
        mark={mark}
        title="Nexplore"
        description={error}
        action={<SecondaryAction onClick={onRetry}>Retry</SecondaryAction>}
      />
    );
  }

  if (account?.auth._tag === "SignedIn") {
    return (
      <WelcomeItem
        mark={mark}
        title="Nexplore"
        description={account.auth.name ?? undefined}
        status={<StatusLabel status="connected" label="Signed in" />}
      />
    );
  }

  if (account?.auth._tag === "SigningIn") {
    const code = account.auth.userCode;
    return (
      <WelcomeItem
        mark={mark}
        title="Nexplore"
        description={
          code ? (
            <span className="font-mono font-medium tracking-wider text-foreground">{code}</span>
          ) : (
            "Finish in your browser"
          )
        }
        status={<StatusLabel status="pending" label="Waiting" />}
        action={
          code ? (
            <PrimaryAction onClick={onOpenVerification}>Copy code & open</PrimaryAction>
          ) : undefined
        }
      />
    );
  }

  const message = error ?? account?.lastError ?? undefined;
  return (
    <WelcomeItem
      mark={mark}
      title="Nexplore"
      description={message}
      action={
        <div className="flex items-center gap-2">
          <SecondaryAction onClick={onSkip}>Skip</SecondaryAction>
          <PrimaryAction onClick={onSignIn} disabled={pending || !loaded}>
            {pending ? "Starting…" : "Sign in"}
          </PrimaryAction>
        </div>
      }
    />
  );
}
