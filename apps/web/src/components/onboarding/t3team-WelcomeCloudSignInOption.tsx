import { CloudIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useCloudBrokerAuth } from "~/cloud/t3team-useCloudBrokerAuth";

import { Button } from "../ui/button";

/**
 * The welcome wizard's cloud row. With the Nexi broker configured, cloud sessions sign in with
 * Nexplore (Entra device code) — so the row offers that instead of T3 Connect. Without a broker it
 * renders `fallback`, the T3 Connect row, unchanged.
 */
export function WelcomeCloudSignInOption({ fallback }: { readonly fallback: ReactNode }) {
  const auth = useCloudBrokerAuth();
  if (auth.status === null) return null; // one quick status read; avoids flashing the wrong row
  if (!auth.status.enabled) return <>{fallback}</>;
  const state = auth.status.auth;

  const detail =
    state._tag === "SignedIn"
      ? state.name
        ? `Signed in as ${state.name}`
        : "Signed in"
      : state._tag === "SigningIn"
        ? `Enter ${state.userCode} at Microsoft`
        : auth.pending
          ? "Starting…"
          : "Sign in";

  return (
    <div className="rounded-lg border border-border bg-background">
      <Button
        variant="ghost"
        size="sm-multiline"
        className="min-h-14 w-full justify-start sm:min-h-14"
        disabled={state._tag === "SignedIn" || auth.pending}
        onClick={state._tag === "SigningIn" ? auth.openVerification : auth.signIn}
      >
        <CloudIcon className="size-4 text-muted-foreground" />
        <span className="flex-1 text-left">Nexplore cloud sessions</span>
        <span className="text-xs text-muted-foreground">
          {state._tag === "SigningIn" ? (
            <>
              Enter <span className="font-mono font-semibold">{state.userCode}</span> at Microsoft ·
              copy & open
            </>
          ) : (
            detail
          )}
        </span>
      </Button>
      {(auth.error ?? auth.status.lastError) ? (
        <p className="px-3 pb-3 text-destructive text-xs">{auth.error ?? auth.status.lastError}</p>
      ) : null}
    </div>
  );
}
