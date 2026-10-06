import type { AccountStatus } from "@t3tools/contracts";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { readLocalApi } from "~/localApi";

import { accountsApi } from "./t3team-accountsApi";
import { CredentialRequestError } from "./t3team-credentialRequest";

/** While a sign-in waits for the user, the server finishes it on its own; poll gently. */
const SIGNING_IN_POLL_MS = 2_500;

/**
 * The accounts this machine's server signs the user in to (`defineAccount` in a pack), as it holds
 * them. One store for the whole app: the Settings sidebar, the cloud panel and the welcome wizard
 * show the same state, and a sign-in started in one finishes in all. Fetched when first shown,
 * polled only while a sign-in is pending, so an idle app makes no requests.
 */
interface AccountsSnapshot {
  /** Null until the first read answers. */
  readonly accounts: ReadonlyArray<AccountStatus> | null;
  readonly pending: boolean;
  readonly error: string | null;
}

let snapshot: AccountsSnapshot = { accounts: null, pending: false, error: null };
const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | undefined;

function publish(next: Partial<AccountsSnapshot>) {
  snapshot = { ...snapshot, ...next };
  syncPolling();
  for (const listener of listeners) listener();
}

const refresh = () =>
  accountsApi
    .list()
    .then((result) => result.accounts)
    .catch(() => snapshot.accounts);

function syncPolling() {
  const signingIn =
    snapshot.accounts?.some((account) => account.auth._tag === "SigningIn") ?? false;
  if (signingIn && pollTimer === undefined && listeners.size > 0) {
    pollTimer = setInterval(() => {
      void refresh().then((accounts) => publish({ accounts }));
    }, SIGNING_IN_POLL_MS);
  } else if ((!signingIn || listeners.size === 0) && pollTimer !== undefined) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

function run(call: () => Promise<unknown>) {
  publish({ pending: true, error: null });
  void call()
    .then(() => accountsApi.list())
    .then((result) => publish({ accounts: result.accounts, pending: false }))
    .catch((cause: unknown) =>
      publish({
        pending: false,
        error: cause instanceof CredentialRequestError ? cause.message : String(cause),
      }),
    );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  syncPolling();
  return () => {
    listeners.delete(listener);
    syncPolling();
  };
}

export function useAccounts(): AccountsSnapshot & {
  readonly signIn: (accountId: string) => void;
  readonly signOut: (accountId: string) => void;
  /** Copies the device code and opens the issuer's code page (when the issuer has one). */
  readonly openVerification: (accountId: string) => void;
} {
  const current = useSyncExternalStore(subscribe, () => snapshot);

  // Read once per surface while nothing is known yet — including after a failed read at startup.
  useEffect(() => {
    if (snapshot.accounts === null && !snapshot.pending) run(() => Promise.resolve());
  }, []);

  const openVerification = useCallback((accountId: string) => {
    const auth = snapshot.accounts?.find((account) => account.id === accountId)?.auth;
    if (auth?._tag !== "SigningIn" || auth.userCode === null || auth.verificationUri === null) {
      return;
    }
    void navigator.clipboard?.writeText(auth.userCode).catch(() => {});
    const api = readLocalApi();
    if (api) void api.shell.openExternal(auth.verificationUri);
    else window.open(auth.verificationUri, "_blank", "noopener,noreferrer");
  }, []);

  return {
    ...current,
    signIn: useCallback((accountId: string) => run(() => accountsApi.signIn(accountId)), []),
    signOut: useCallback((accountId: string) => run(() => accountsApi.signOut(accountId)), []),
    openVerification,
  };
}

/** One account from the store, with its actions bound; `account` is null until known. */
export function useAccount(accountId: string | null) {
  const accounts = useAccounts();
  const account = accounts.accounts?.find((candidate) => candidate.id === accountId) ?? null;
  return {
    account,
    loaded: accounts.accounts !== null,
    pending: accounts.pending,
    error: accounts.error,
    signIn: () => accountId !== null && accounts.signIn(accountId),
    signOut: () => accountId !== null && accounts.signOut(accountId),
    openVerification: () => accountId !== null && accounts.openVerification(accountId),
  };
}
