import type { ToolAuthState } from "@t3tools/contracts";

import { getSourceControlPresentationForKind } from "~/sourceControlPresentation";
import { isGitHubSignInRunning } from "~/t3team/hooks/t3team-useGitHubSignIn";
import {
  PrimaryAction,
  SecondaryAction,
  ServiceMark,
  StatusLabel,
  WelcomeItem,
} from "~/t3team/welcome/t3team-welcomeLayout";

const GitHubIcon = getSourceControlPresentationForKind("github").Icon;

export type NexiWelcomeGitHubRowProps = {
  readonly host: string;
  readonly state: ToolAuthState | undefined;
  readonly skipped: boolean;
  readonly onStart: () => void;
  readonly onCopyAndOpen: () => void;
  readonly onSkip: () => void;
  readonly showSkip: boolean;
};

export function NexiWelcomeGitHubRow({
  host,
  state,
  skipped,
  onStart,
  onCopyAndOpen,
  onSkip,
  showSkip,
}: NexiWelcomeGitHubRowProps) {
  const mark = (
    <ServiceMark label={host}>
      <GitHubIcon aria-hidden className="size-5" />
    </ServiceMark>
  );
  const phase = state?.phase ?? "idle";

  if (skipped) {
    return (
      <WelcomeItem
        mark={mark}
        title={host}
        status={<StatusLabel status="skipped" label="Skipped" />}
      />
    );
  }

  if (phase === "connected") {
    return (
      <WelcomeItem
        mark={mark}
        title={host}
        description={state?.account ?? undefined}
        status={<StatusLabel status="connected" label="Signed in" />}
      />
    );
  }

  if (phase === "awaiting-open") {
    return (
      <WelcomeItem
        mark={mark}
        title={host}
        description={
          state?.displayCode ? (
            <span className="font-mono font-medium tracking-wider text-foreground">
              {state.displayCode}
            </span>
          ) : (
            "Finish in your browser"
          )
        }
        status={<StatusLabel status="pending" label="Waiting" />}
        action={<PrimaryAction onClick={onCopyAndOpen}>Copy code & open</PrimaryAction>}
      />
    );
  }

  if (isGitHubSignInRunning(phase)) {
    return (
      <WelcomeItem
        mark={mark}
        title={host}
        description="Starting sign-in…"
        status={<StatusLabel status="pending" label="Waiting" />}
      />
    );
  }

  const failed = phase === "failed" || phase === "expired";
  return (
    <WelcomeItem
      mark={mark}
      title={host}
      description={failed ? (state?.message ?? "Sign-in failed") : undefined}
      action={
        <div className="flex items-center gap-2">
          {showSkip ? <SecondaryAction onClick={onSkip}>Skip</SecondaryAction> : null}
          <SecondaryAction onClick={onStart}>
            {failed ? "Sign in again" : "Sign in"}
          </SecondaryAction>
        </div>
      }
    />
  );
}
