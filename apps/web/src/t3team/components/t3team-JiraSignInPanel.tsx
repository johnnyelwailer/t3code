/**
 * The "sign in to Jira" panel: a dashed surface with a heading and the sign-in button, running
 * the same OAuth flow the onboarding "Sign in to Jira" path does — no new state invented.
 *
 * On completion it persists the new account (the "done" branch, like the create-project dialog)
 * or simply reports the server-side completion ("connected" branch), then fires `onSignedIn` so
 * the view can reload.
 */
import { useEffect, useRef } from "react";

import { useBackend } from "~/t3team/backend/t3team-index";
import { useAtlassianOAuth } from "~/t3team/hooks/t3team-useAtlassianOAuth";
import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { Button } from "~/t3team/components/ui/t3team-button";

export function JiraSignInPanel({
  heading,
  onSignedIn,
}: {
  /** The state line above the button, e.g. "Sign in to Jira to load your work." */
  readonly heading: string;
  /** Fired once the sign-in has completed and the account is persisted. */
  readonly onSignedIn?: (() => void) | undefined;
}) {
  const oauth = useAtlassianOAuth();
  const backend = useBackend();
  const reportedRef = useRef(false);

  useEffect(() => {
    if (reportedRef.current) return;
    if (oauth.state.kind === "connected") {
      // The server finished the flow itself (e.g. sign-in in another browser): the account is
      // already persisted there, so the view just needs to reload.
      reportedRef.current = true;
      onSignedIn?.();
    } else if (oauth.state.kind === "done" && backend) {
      // The popup finished in this tab: persist the grant through the same path the
      // create-project dialog uses, then reload.
      reportedRef.current = true;
      void backend.atlassian
        .connectOAuth({ sites: oauth.state.sites, token: oauth.state.token })
        .then(() => onSignedIn?.())
        .catch(() => {
          // The account may already exist server-side; the next reload will show it.
          onSignedIn?.();
        });
    }
  }, [oauth.state, backend, onSignedIn]);

  const inFlight =
    oauth.state.kind === "opening" ||
    oauth.state.kind === "waiting" ||
    oauth.state.kind === "exchanging";
  const failed = oauth.state.kind === "error" ? oauth.state : null;
  const manualOpen = oauth.state.kind === "needs_manual_open" ? oauth.state : null;

  return (
    <T3SurfacePanel
      tone="dashed"
      className="flex flex-col items-center gap-3 px-4 py-8 text-sm text-muted-foreground"
    >
      <p className="text-foreground">{heading}</p>
      {failed ? <p className="text-xs text-destructive">{failed.message}</p> : null}
      {manualOpen ? (
        <Button
          size="xs"
          render={
            <a
              href={manualOpen.signinUrl}
              target="_blank"
              rel="noreferrer external"
              onClick={() => {
                void oauth.mintFreshSigninLink().catch(() => {});
              }}
            />
          }
        >
          Open the sign-in link
        </Button>
      ) : (
        <Button
          size="xs"
          disabled={inFlight}
          onClick={() => {
            void oauth.startOAuth();
          }}
        >
          {inFlight ? "Opening sign-in…" : "Sign in to Jira"}
        </Button>
      )}
    </T3SurfacePanel>
  );
}
