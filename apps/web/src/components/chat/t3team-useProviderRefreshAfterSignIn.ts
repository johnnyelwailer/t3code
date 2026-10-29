import type { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useEffect, useEffectEvent, useState } from "react";

import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";

/**
 * - `idle`: not signed in (or nothing to refresh yet).
 * - `refreshing`: signed in; the machine is re-checking the provider.
 * - `notReady`: the re-check finished and the instance still is not ready.
 * - `failed`: the re-check itself could not run.
 */
export type ProviderRefreshAfterSignInStatus = "idle" | "refreshing" | "notReady" | "failed";

export interface ProviderRefreshAfterSignIn {
  readonly status: ProviderRefreshAfterSignInStatus;
  readonly error: string | null;
  readonly retry: () => void;
}

type Outcome =
  | { readonly key: string; readonly status: "notReady" }
  | { readonly key: string; readonly status: "failed"; readonly error: string };

/**
 * A provider's status is probed on an interval (an hour), not when a CLI sign-in finishes, so right
 * after the connect card reports "connected" the picker still lists the instance as not ready and
 * the models stay out of reach until a reload. This asks the machine the thread runs on to probe
 * that one instance as soon as `signedIn` turns true; the live provider list then flips the
 * instance to ready and the picker swaps the connect panel for the model list by itself.
 *
 * Mirrors `CodexSetupSection`, which does the same after the provider-auth flow succeeds.
 */
export function useProviderRefreshAfterSignIn(input: {
  readonly environmentId: EnvironmentId | null;
  readonly instanceId: ProviderInstanceId;
  readonly signedIn: boolean;
}): ProviderRefreshAfterSignIn {
  const { environmentId, instanceId, signedIn } = input;
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const key = `${environmentId}:${instanceId}:${attempt}`;

  const refresh = useEffectEvent(async (target: EnvironmentId, requestKey: string) => {
    const result = await refreshProviders({ environmentId: target, input: { instanceId } });
    return result._tag === "Success"
      ? ({ key: requestKey, status: "notReady" } as const)
      : ({
          key: requestKey,
          status: "failed",
          error: errorMessage(squashAtomCommandFailure(result)),
        } as const);
  });

  useEffect(() => {
    if (!signedIn || environmentId === null) return;
    let cancelled = false;
    void refresh(environmentId, key).then((next) => {
      if (!cancelled) setOutcome(next);
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn, environmentId, key]);

  if (!signedIn || environmentId === null) return { status: "idle", error: null, retry: noop };
  const retry = () => setAttempt((current) => current + 1);
  if (outcome === null || outcome.key !== key) return { status: "refreshing", error: null, retry };
  return {
    status: outcome.status,
    error: outcome.status === "failed" ? outcome.error : null,
    retry,
  };
}

function noop() {}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== ""
    ? error.message
    : "The check could not be started.";
}
