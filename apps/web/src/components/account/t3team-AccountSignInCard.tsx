import type { AccountStatus } from "@t3tools/contracts";

import { Button } from "../ui/button";

/**
 * Asks for an account sign-in where a feature needs it ("Sign in to {label} to use cloud
 * sessions"). Signed in, it renders nothing: the account itself lives in the app's account entry,
 * not in every feature that uses it. Presentational — callers connect it to `useAccount`.
 */
export function AccountSignInCard({
  account,
  purpose,
  pending = false,
  error = null,
  onSignIn,
  onOpenVerification,
}: {
  readonly account: AccountStatus | null;
  /** What the sign-in is for, completing "Sign in to {label} …", e.g. "to use cloud sessions". */
  readonly purpose: string;
  readonly pending?: boolean;
  readonly error?: string | null;
  readonly onSignIn: () => void;
  readonly onOpenVerification: () => void;
}) {
  if (account === null || account.auth._tag === "SignedIn") return null;
  const message = error ?? account.lastError;
  const auth = account.auth;

  return (
    <div className="mx-3 flex flex-col gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 sm:mx-4 sm:flex-row sm:items-center sm:justify-between">
      {auth._tag === "SigningIn" ? (
        <>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm">Finish signing in in the browser window that opened.</p>
            {auth.userCode !== null ? (
              <p className="text-muted-foreground text-xs">
                No window? Enter{" "}
                <span className="font-mono font-semibold tracking-wider">{auth.userCode}</span> on
                the sign-in page instead.
              </p>
            ) : null}
          </div>
          {auth.userCode !== null ? (
            <Button size="sm" onClick={onOpenVerification}>
              Copy code & open
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm">
              Sign in to {account.label} {purpose}.
            </p>
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
