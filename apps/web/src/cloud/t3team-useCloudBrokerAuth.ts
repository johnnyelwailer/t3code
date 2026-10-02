import type { CloudBrokerStatus } from "@t3tools/contracts";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { readLocalApi } from "~/localApi";

import { CloudBrokerRequestError, cloudBrokerApi } from "./t3team-cloudBrokerApi";

/** While a device code waits for the user, the server finishes the sign-in on its own; poll gently. */
const SIGNING_IN_POLL_MS = 2_500;

/**
 * The Nexplore (Entra) sign-in the Nexi broker needs, as this machine's server holds it. One store
 * for the whole app: the Settings sidebar, the cloud panel and the welcome wizard show the same
 * state, and a sign-in started in one finishes in all. Fetched when first shown, polled only while a
 * device code is pending, so an idle app makes no requests.
 */
interface BrokerAuthSnapshot {
  readonly status: CloudBrokerStatus | null;
  readonly pending: boolean;
  readonly error: string | null;
}

let snapshot: BrokerAuthSnapshot = { status: null, pending: false, error: null };
const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | undefined;

function publish(next: Partial<BrokerAuthSnapshot>) {
  snapshot = { ...snapshot, ...next };
  syncPolling();
  for (const listener of listeners) listener();
}

function syncPolling() {
  const signingIn = snapshot.status?.auth._tag === "SigningIn";
  if (signingIn && pollTimer === undefined && listeners.size > 0) {
    pollTimer = setInterval(() => {
      void cloudBrokerApi
        .status()
        .then((status) => publish({ status }))
        .catch(() => {});
    }, SIGNING_IN_POLL_MS);
  } else if ((!signingIn || listeners.size === 0) && pollTimer !== undefined) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

function run(call: () => Promise<CloudBrokerStatus | null>) {
  publish({ pending: true, error: null });
  void call()
    .then((next) => next ?? cloudBrokerApi.status())
    .then((status) => publish({ status, pending: false }))
    .catch((cause: unknown) =>
      publish({
        pending: false,
        error: cause instanceof CloudBrokerRequestError ? cause.message : String(cause),
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

export function useCloudBrokerAuth(): BrokerAuthSnapshot & {
  readonly signIn: () => void;
  readonly signOut: () => void;
  /** Copies the code and opens Microsoft's device-login page. */
  readonly openVerification: () => void;
} {
  const current = useSyncExternalStore(subscribe, () => snapshot);

  // Read once per surface while nothing is known yet — including after a failed read at startup.
  useEffect(() => {
    if (snapshot.status === null && !snapshot.pending) run(() => cloudBrokerApi.status());
  }, []);

  const openVerification = useCallback(() => {
    const auth = snapshot.status?.auth;
    if (auth?._tag !== "SigningIn") return;
    void navigator.clipboard?.writeText(auth.userCode).catch(() => {});
    const api = readLocalApi();
    if (api) void api.shell.openExternal(auth.verificationUri);
    else window.open(auth.verificationUri, "_blank", "noopener,noreferrer");
  }, []);

  return {
    ...current,
    signIn: useCallback(() => run(() => cloudBrokerApi.signIn()), []),
    signOut: useCallback(() => run(() => cloudBrokerApi.signOut().then(() => null)), []),
    openVerification,
  };
}
