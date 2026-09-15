/**
 * The "Your Jira session expired" state, shared by the My Work digest and the legacy My Work
 * views. The server has already dropped the dead refresh token, so the only way forward is a
 * fresh sign-in: this panel says so in plain words and starts the same OAuth flow the onboarding
 * "Sign in to Jira" path runs — no new state invented.
 *
 * On completion it persists the new account (the "done" branch, like the create-project dialog)
 * or simply reports the server-side completion ("connected" branch), then asks the view to reload.
 */
import { JiraSignInPanel } from "~/t3team/components/t3team-JiraSignInPanel";

export function JiraSessionExpiredPanel({
  onSignedIn,
}: {
  /** Fired once the sign-in has completed and the account is persisted. */
  readonly onSignedIn?: (() => void) | undefined;
}) {
  return (
    <JiraSignInPanel heading="Your Jira session expired. Sign in again." onSignedIn={onSignedIn} />
  );
}
