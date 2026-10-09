import { CloudIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useAccount } from "~/account/t3team-useAccounts";
import { useCloudBrokerStatus } from "~/cloud/t3team-useCloudBrokerStatus";

import { Button } from "../ui/button";
import { WelcomeCloudSessions } from "./t3team-WelcomeCloudSessions";

/**
 * The welcome wizard's cloud row. With the Nexi broker configured, cloud sessions sign in with the
 * account the broker authenticates with — so the row offers that instead of T3 Connect. Without a
 * broker it renders `fallback`, the T3 Connect row, unchanged.
 */
export function WelcomeCloudSignInOption({ fallback }: { readonly fallback: ReactNode }) {
  const broker = useCloudBrokerStatus();
  const auth = useAccount(broker?.enabled ? broker.accountId : null);
  if (broker === null) return null; // one quick status read; avoids flashing the wrong row
  if (!broker.enabled) return <>{fallback}</>;
  if (auth.account === null) return null;
  const { account } = auth;
  const state = account.auth;

  const detail =
    state._tag === "SignedIn"
      ? state.name
        ? `Signed in as ${state.name}`
        : "Signed in"
      : state._tag === "SigningIn"
        ? "Finish in your browser"
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
        <span className="flex-1 text-left">{account.label} cloud sessions</span>
        <span className="text-xs text-muted-foreground">
          {state._tag === "SigningIn" && state.userCode !== null ? (
            <>
              Finish in your browser, or enter{" "}
              <span className="font-mono font-semibold">{state.userCode}</span> · copy & open
            </>
          ) : (
            detail
          )}
        </span>
      </Button>
      {(auth.error ?? account.lastError) ? (
        <p className="px-3 pb-3 text-destructive text-xs">{auth.error ?? account.lastError}</p>
      ) : null}
      {state._tag === "SignedIn" ? <WelcomeCloudSessions /> : null}
    </div>
  );
}
