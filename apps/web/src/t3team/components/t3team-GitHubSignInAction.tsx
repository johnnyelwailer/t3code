import type { ToolAuthState } from "@t3tools/contracts";

import { GitHubIcon } from "~/t3team/t3team-gitHubIcon";
import { PullRequestCopyableCode } from "~/components/pullRequest/PullRequestCopyableCode";
import { AwaitingOpenPhase } from "~/components/settings/t3team-ToolAuthCardPhases";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { isGitHubSignInRunning, useGitHubSignIn } from "~/t3team/hooks/t3team-useGitHubSignIn";

function gitHubSignInCommand(host: string): string {
  return `gh auth login --hostname ${host}`;
}

/** The terminal route, offered only after the in-app sign-in failed (no gh, no pty, expired code). */
function TerminalSignIn({ host }: { readonly host: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 text-2xs text-muted-foreground">
      <span>Or run on the server:</span>
      <PullRequestCopyableCode
        value={gitHubSignInCommand(host)}
        target="sign-in command"
        copyLabel="Copy sign-in command"
        copiedLabel="Sign-in command copied"
        className="font-mono text-2xs"
      />
    </div>
  );
}

export interface GitHubSignInViewProps {
  readonly host: string;
  /** gh's state for this host; `undefined` until a sign-in for it starts. */
  readonly state: ToolAuthState | undefined;
  readonly onStart: () => void;
  readonly onCancel: () => void;
}

/** One host's sign-in, by phase: the button, the device code while gh polls, the outcome. */
export function GitHubSignInView({ host, state, onStart, onCancel }: GitHubSignInViewProps) {
  const phase = state?.phase ?? "idle";

  if (phase === "awaiting-open") {
    return (
      <AwaitingOpenPhase
        label={host}
        url={state?.url}
        displayCode={state?.displayCode}
        onCancel={onCancel}
      />
    );
  }
  if (isGitHubSignInRunning(phase)) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner className="size-3.5" />
        Starting sign-in to {host}…
      </div>
    );
  }
  if (phase === "connected") {
    return <p className="text-xs text-muted-foreground">Signed in to {host}.</p>;
  }

  const failed = phase === "failed" || phase === "expired";
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Button size="sm" className="self-start" onClick={onStart}>
        <GitHubIcon />
        {failed ? `Sign in to ${host} again` : `Sign in to ${host}`}
      </Button>
      {failed && state?.message ? (
        <p className="whitespace-pre-line text-xs text-destructive">{state.message}</p>
      ) : null}
      {failed ? <TerminalSignIn host={host} /> : null}
    </div>
  );
}

/**
 * "Sign in to <host>": runs gh's device sign-in from the app — the one-time code, a button that
 * copies it and opens the host's device page, and gh's own polling until the host is signed in.
 */
export function GitHubSignInAction({
  host,
  onSignedIn,
}: {
  readonly host: string;
  /** Runs once gh reports the host signed in, whether here or in a terminal. */
  readonly onSignedIn?: () => void;
}) {
  const signIn = useGitHubSignIn(host, onSignedIn);
  return (
    <GitHubSignInView
      host={host}
      state={signIn.state}
      onStart={signIn.start}
      onCancel={signIn.cancel}
    />
  );
}
