import type { CloudBrokerStatus } from "@t3tools/contracts";
import { useCallback, useEffect, useState } from "react";

import { readLocalApi } from "~/localApi";

import { CloudBrokerRequestError, cloudBrokerApi } from "./t3team-cloudBrokerApi";

/** While a device code waits for the user, the server finishes the sign-in on its own; poll gently. */
const SIGNING_IN_POLL_MS = 2_500;

/**
 * The Nexplore (Entra) sign-in the Nexi broker needs, as this machine's server holds it. Fetched on
 * mount, polled only while a device code is pending, so an idle panel makes no requests.
 */
export function useCloudBrokerAuth(): {
  readonly status: CloudBrokerStatus | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly signIn: () => void;
  readonly signOut: () => void;
  /** Copies the code and opens Microsoft's device-login page. */
  readonly openVerification: () => void;
} {
  const [status, setStatus] = useState<CloudBrokerStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback((call: () => Promise<CloudBrokerStatus | null>) => {
    setPending(true);
    setError(null);
    void call()
      .then((next) => (next ? setStatus(next) : cloudBrokerApi.status().then(setStatus)))
      .catch((cause: unknown) =>
        setError(cause instanceof CloudBrokerRequestError ? cause.message : String(cause)),
      )
      .finally(() => setPending(false));
  }, []);

  useEffect(() => run(() => cloudBrokerApi.status()), [run]);

  const signingIn = status?.auth._tag === "SigningIn";
  useEffect(() => {
    if (!signingIn) return;
    const timer = setInterval(() => {
      void cloudBrokerApi
        .status()
        .then(setStatus)
        .catch(() => {});
    }, SIGNING_IN_POLL_MS);
    return () => clearInterval(timer);
  }, [signingIn]);

  const openVerification = useCallback(() => {
    if (status?.auth._tag !== "SigningIn") return;
    void navigator.clipboard?.writeText(status.auth.userCode).catch(() => {});
    const url = status.auth.verificationUri;
    const api = readLocalApi();
    if (api) void api.shell.openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  }, [status]);

  return {
    status,
    pending,
    error,
    signIn: useCallback(() => run(() => cloudBrokerApi.signIn()), [run]),
    signOut: useCallback(() => run(() => cloudBrokerApi.signOut().then(() => null)), [run]),
    openVerification,
  };
}
