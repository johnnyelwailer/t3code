import { CloudIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useAccount } from "~/account/t3team-useAccounts";
import { useCloudBrokerStatus } from "~/cloud/t3team-useCloudBrokerStatus";

import { Button } from "../ui/button";
import { WelcomeCloudSessions } from "./t3team-WelcomeCloudSessions";

/**
 * The Welcome page's cloud row. With the Nexi broker configured, cloud sessions sign in with the
 * account the broker authenticates with; `section` wraps the row in the page's section layout.
 * Without a broker there is no row (upstream's Phone section covers T3 Connect).
 */
export function WelcomeCloudSignInOption({
  section,
}: {
  readonly section: (row: ReactNode) => ReactNode;
}) {
  const broker = useCloudBrokerStatus();
  const auth = useAccount(broker?.enabled ? broker.accountId : null);
  if (broker === null || !broker.enabled || auth.account === null) return null;
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

  return section(
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
    </div>,
  );
}
