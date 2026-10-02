import type { CloudBrokerStatus } from "@t3tools/contracts";

import { Button } from "../ui/button";

/**
 * The Nexplore sign-in cloud sessions need when they run over the Nexi broker. Device code, so
 * nothing listens on this machine: the user enters a short code on Microsoft's page in any browser.
 * Presentational — `t3team-CloudBrokerSignInBanner` connects it to the server.
 */
export function CloudBrokerSignInCard({
  status,
  pending = false,
  error = null,
  onSignIn,
  onSignOut,
  onOpenVerification,
}: {
  readonly status: CloudBrokerStatus | null;
  readonly pending?: boolean;
  readonly error?: string | null;
  readonly onSignIn: () => void;
  readonly onSignOut: () => void;
  readonly onOpenVerification: () => void;
}) {
  if (status === null || !status.enabled) return null;
  const message = error ?? status.lastError;

  return (
    <div className="mx-3 flex flex-col gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 sm:mx-4 sm:flex-row sm:items-center sm:justify-between">
      {status.auth._tag === "SignedIn" ? (
        <>
          <p className="text-muted-foreground text-xs">
            Signed in to Nexplore{status.auth.name ? ` as ${status.auth.name}` : ""}.
          </p>
          <Button size="sm" variant="ghost" disabled={pending} onClick={onSignOut}>
            Sign out
          </Button>
        </>
      ) : status.auth._tag === "SigningIn" ? (
        <>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm">
              Enter{" "}
              <span className="font-mono font-semibold tracking-wider">{status.auth.userCode}</span>{" "}
              at Microsoft to sign in.
            </p>
            <p className="text-muted-foreground text-xs">
              Waiting for you to finish in the browser…
            </p>
          </div>
          <Button size="sm" onClick={onOpenVerification}>
            Copy code & open
          </Button>
        </>
      ) : (
        <>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm">Sign in to Nexplore to use cloud sessions.</p>
            {message ? <p className="text-destructive text-xs">{message}</p> : null}
          </div>
          <Button size="sm" disabled={pending} onClick={onSignIn}>
            {pending ? "Starting…" : "Sign in"}
          </Button>
        </>
      )}
    </div>
  );
}
